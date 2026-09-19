"""The rules, as pure functions.

No I/O, no model, no store, no clock: give it records, get records back. That is
what makes every score and every next step deterministic, testable in
milliseconds and explainable in twenty seconds. The model never produces a score
or a state.

Hop counts (`state.hops`) arrive already counted from record history by the
flow; nothing here reads slice.budget. A spend limit and a revision limit are
different numbers and must never share a counter.
"""
from __future__ import annotations

import math
import zlib
from typing import Sequence

from .schema import (Action, Answer, Graph, Level, NodeBelief, Overall, Prediction,
                     ProofResult, SessionState)

# ---- this domain's opinions, in one place so they can be argued about ----------
LEVEL_WEIGHT = {1: 0.6, 2: 1.0, 3: 1.4}
LEVEL_DIFFICULTY = {1: -1.0, 2: 0.0, 3: 1.0}
GUESS_FLOOR = 0.25
TARGET_P = 0.65
WEAK_BELOW, SOLID_ABOVE = 0.40, 0.70
CONFIRM_BELOW = 0.50
MAX_HOPS = 2
MAX_REOPENS = 1
MAX_FOLLOWUPS = 3
DIAG_CAP = 15
VERIFY_QS = 2
DRILL_CAP = 20
Z90 = 1.64


# ============================================================ belief and ability

def answer_weight(a: Answer) -> float:
    w = LEVEL_WEIGHT[a.level]
    return w * 0.5 if (a.correct and a.confidence == "guessing") else w


def is_danger(answers: Sequence[Answer]) -> bool:
    """A wrong answer at 'certain', or two wrong at 'fairly_sure'."""
    wrong = [a for a in answers if not a.correct]
    return (any(a.confidence == "certain" for a in wrong)
            or sum(a.confidence == "fairly_sure" for a in wrong) >= 2)


def node_belief(node_id: str, answers: Sequence[Answer], verified: bool = False) -> NodeBelief:
    """Evidence-weighted Beta belief. Zero answers is 'unknown', never mastery 0."""
    mine = [a for a in answers if a.node_id == node_id]
    alpha = 1.0 + sum(answer_weight(a) for a in mine if a.correct)
    beta = 1.0 + sum(answer_weight(a) for a in mine if not a.correct)
    n = len(mine)
    mastery = alpha / (alpha + beta)
    total = alpha + beta
    sd = math.sqrt(alpha * beta / (total * total * (total + 1)))
    low, high = max(0.0, mastery - Z90 * sd), min(1.0, mastery + Z90 * sd)
    if verified:
        status = "verified"
    elif n == 0:
        status = "unknown"
    elif n == 1:
        status = "tentative"
    elif mastery < WEAK_BELOW:
        status = "weak"
    elif mastery > SOLID_ABOVE:
        status = "solid"
    else:
        status = "shaky"
    return NodeBelief(node_id=node_id, alpha=alpha, beta=beta, n=n, mastery=mastery,
                      low=low, high=high, status=status, danger=is_danger(mine))


def all_beliefs(graph: Graph, answers: Sequence[Answer],
                verified: set[str] | frozenset[str] = frozenset()) -> dict[str, NodeBelief]:
    return {n.id: node_belief(n.id, answers, n.id in verified) for n in graph.nodes}


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def p_correct(theta: float, level: int) -> float:
    return GUESS_FLOOR + (1 - GUESS_FLOOR) * _sigmoid(theta - LEVEL_DIFFICULTY[level])


def update_theta(theta: float, answer: Answer, n_before: int) -> float:
    """theta + k * (correct - P), with k decaying from 0.4 to 0.15."""
    k = max(0.15, 0.4 - 0.025 * n_before)
    return theta + k * ((1.0 if answer.correct else 0.0) - p_correct(theta, answer.level))


def next_level(theta: float) -> Level:
    return min((1, 2, 3), key=lambda lv: abs(p_correct(theta, lv) - TARGET_P))   # type: ignore[return-value]


def theta_from(answers: Sequence[Answer]) -> float:
    theta = 0.0
    for i, a in enumerate(answers):
        theta = update_theta(theta, a, i)
    return theta


# ================================================================== predictions

def _descendants(graph: Graph, source: str) -> dict[str, tuple[int, float]]:
    """Shortest distance and product of edge weights to every dependent."""
    out: dict[str, tuple[int, float]] = {}
    frontier = [(source, 0, 1.0)]
    seen = {source}
    while frontier:
        nxt = []
        for node, dist, w in frontier:
            for e in graph.edges:
                if e.source == node and e.target not in seen:
                    seen.add(e.target)
                    out[e.target] = (dist + 1, w * e.weight)
                    nxt.append((e.target, dist + 1, w * e.weight))
        frontier = nxt
    return out


def predict_candidates(graph: Graph, beliefs: dict[str, NodeBelief],
                       max_predictions: int = 3) -> list[Prediction]:
    """Rank untested dependents of Danger/Weak nodes:
    edge weight * (1 - mastery(source)) * (1.0 if danger else 0.7) / distance."""
    best: dict[str, Prediction] = {}
    for s, b in beliefs.items():
        if not (b.danger or b.status == "weak") or b.status == "verified":
            continue
        for d, (dist, w) in _descendants(graph, s).items():
            if beliefs.get(d) is None or beliefs[d].n > 1:
                continue
            score = w * (1.0 - b.mastery) * (1.0 if b.danger else 0.7) / dist
            if score <= 0:
                continue
            cur = best.get(d)
            if cur is None or score > cur.score:
                best[d] = Prediction(id=f"{s}->{d}", source_id=s, target_id=d, score=round(score, 4))
    return sorted(best.values(), key=lambda p: -p.score)[:max_predictions]


def resolve_prediction(pred: Prediction, target: NodeBelief) -> Prediction:
    """Confirmed if the target's mastery is below 0.5 after testing."""
    if target.n == 0:
        outcome = "untested"
    else:
        outcome = "confirmed" if target.mastery < CONFIRM_BELOW else "refuted"
    return pred.model_copy(update={"outcome": outcome})


def reweight_edge_weight(weight: float, outcome: str | None) -> float:
    """weight + 0.25 * (outcome - weight), clipped to [0.1, 1]; untested changes nothing."""
    if outcome not in ("confirmed", "refuted"):
        return weight
    y = 1.0 if outcome == "confirmed" else 0.0
    return min(1.0, max(0.1, weight + 0.25 * (y - weight)))


# ==================================================================== the proof

def contrast_verdict(node_id: str, misconception_id: str | None,
                     discriminating_correct: bool, control_correct: bool) -> ProofResult:
    """Both right: verified. Control only: not repaired (the signature of a guess
    or an unchanged belief). Discriminating only: improving."""
    if discriminating_correct and control_correct:
        verdict, note = "verified", "passed the discriminating question and its control"
    elif control_correct and not discriminating_correct:
        verdict, note = "not_repaired", "passed only the control: consistent with a guess or an unchanged belief"
    elif discriminating_correct:
        verdict, note = "improving", "passed the discriminating question but missed its control"
    else:
        verdict, note = "not_repaired", "missed both"
    return ProofResult(node_id=node_id, misconception_id=misconception_id,
                       discriminating_correct=discriminating_correct,
                       control_correct=control_correct, verdict=verdict, note=note)   # type: ignore[arg-type]


# ================================================================== the numbers

def overall_score(graph: Graph, beliefs: dict[str, NodeBelief]) -> Overall:
    """Dependent-weighted mean over ASSESSED nodes only, with a range and a
    coverage figure. Unknown nodes are excluded, not zeroed."""
    total_w = assessed_w = m = lo = hi = 0.0
    for n in graph.nodes:
        w = 1.0 + len(graph.dependents(n.id))
        total_w += w
        b = beliefs.get(n.id)
        if b is None or b.n == 0:
            continue
        assessed_w += w
        m += w * b.mastery
        lo += w * b.low
        hi += w * b.high
    if assessed_w == 0:
        return Overall(overall=None, low=None, high=None, coverage=0.0)
    return Overall(overall=m / assessed_w, low=lo / assessed_w, high=hi / assessed_w,
                   coverage=assessed_w / total_w)


def calibration_flags(answers: Sequence[Answer]) -> int:
    """Topics where confident answers were wrong at least half the time."""
    by: dict[str, list[Answer]] = {}
    for a in answers:
        if a.confidence in ("certain", "fairly_sure"):
            by.setdefault(a.node_id, []).append(a)
    return sum(1 for v in by.values() if len(v) >= 2 and sum(not a.correct for a in v) / len(v) >= 0.5)


# ==================================================================== next step

def next_action(state: SessionState, graph: Graph, beliefs: dict[str, NodeBelief],
                answers: Sequence[Answer], predictions: Sequence[Prediction],
                proofs: Sequence[ProofResult] = ()) -> Action:
    """THE decision function. Called after every answer; returns what to do next,
    with a plain-language reason for the agent log.

    Route depends on what the run found: a repeated miss sends the run DOWN to a
    prerequisite (hop limit MAX_HOPS), a passed prerequisite sends it back UP,
    and a proof that does not pass reopens the drilldown once.
    """
    skip = set(state.exhausted_nodes) | set(state.unanswered_nodes)
    stage = state.phase

    if stage in ("refresh", "diagnostic"):
        a = _refresh(state, answers, skip) or _diagnostic(state, graph, beliefs, answers, skip)
        if a:
            return a
        stage = "verify"
    if stage == "verify":
        a = _verify(state, graph, beliefs, answers, predictions, skip)
        if a:
            return a
        return _start_drilldown(state, graph, beliefs, skip)
    if stage == "drilldown":
        return _drilldown(state, graph, beliefs, answers, proofs, skip)
    return _proof(state, graph, beliefs, answers, proofs, skip)


def _order(graph: Graph) -> dict[str, int]:
    return {n.id: i for i, n in enumerate(graph.nodes)}


def _refresh(state, answers, skip) -> Action | None:
    for n in state.refresh:
        if n in skip or any(a.phase == "refresh" and a.node_id == n for a in answers):
            continue
        return Action(kind="ask", phase="refresh", node_id=n, level=2,
                      reason=f"Second encounter: {n} was verified last time, checking that it still holds.")
    return None


def _diagnostic(state, graph, beliefs, answers, skip) -> Action | None:
    diag = [a for a in answers if a.phase == "diagnostic"]
    cap = min(DIAG_CAP, len(graph.nodes) + MAX_FOLLOWUPS)
    if len(diag) >= cap:
        return None
    followups = len(diag) - len({a.node_id for a in diag})
    last = diag[-1] if diag else None
    if (last is not None and not last.correct and followups < MAX_FOLLOWUPS
            and last.node_id not in skip and beliefs[last.node_id].n < 2):
        lvl: Level = 2 if last.level == 3 else last.level
        return Action(kind="ask", phase="diagnostic", node_id=last.node_id, level=lvl,
                      avoid_misconception=last.misconception_id,
                      reason=f"Wrong answer on {last.node_id}: asking once more to tell a slip from a real gap.")
    order = _order(graph)
    fresh = [n.id for n in graph.nodes if n.id not in skip and beliefs[n.id].n == 0]
    if not fresh:
        return None
    pick = max(fresh, key=lambda x: (len(graph.dependents(x)), -order[x]))
    theta = state.theta
    return Action(kind="ask", phase="diagnostic", node_id=pick, level=next_level(theta),
                  reason=f"Coverage first: {pick} is unassessed and {len(graph.dependents(pick))} topic(s) depend on it.")


def _verify(state, graph, beliefs, answers, predictions, skip) -> Action | None:
    if not state.predicted:
        return Action(kind="predict", phase="verify",
                      reason="Diagnostic done. Writing predictions about untested topics BEFORE testing them.")
    for p in predictions:
        if p.outcome is not None:
            continue
        t = p.target_id
        got = [a for a in answers if a.phase == "verify" and a.node_id == t]
        if t in skip or len(got) >= VERIFY_QS:
            return Action(kind="resolve", phase="verify", node_id=t, prediction_id=p.id,
                          reason=f"Prediction {p.id}: enough evidence on {t} to score it.")
        return Action(kind="ask", phase="verify", node_id=t, level=2, prediction_id=p.id,
                      reason=f"Testing prediction: weakness in {p.source_id} should show up in {t}.")
    return None


def _start_drilldown(state, graph, beliefs, skip) -> Action:
    if state.focus_node and state.focus_node in beliefs:
        target = state.focus_node
        why = "the student chose it"
    else:
        order = _order(graph)
        needy = [b for b in beliefs.values()
                 if b.node_id not in skip and b.status != "verified"
                 and (b.danger or b.status in ("weak", "shaky")
                      or (b.status == "tentative" and b.mastery < 0.5))]
        if not needy:
            return Action(kind="finish", phase="drilldown",
                          reason="No weak or confidently-wrong topic among the assessed ones. Nothing to drill.")
        needy.sort(key=lambda b: (not b.danger, b.mastery, order[b.node_id]))
        target = needy[0].node_id
        why = "confidently wrong" if needy[0].danger else "the weakest assessed topic"
    b = beliefs[target]
    level: Level = 1 if b.status == "weak" else 2
    return Action(kind="ask", phase="drilldown", node_id=target, level=level, focus_node=target,
                  reason=f"Drilling {target} ({why}), starting at L{level}.")


def _tail(dr: Sequence[Answer], node: str) -> list[Answer]:
    out: list[Answer] = []
    for a in reversed(dr):
        if a.node_id != node:
            break
        out.append(a)
    return list(reversed(out))


def _failing(tail: Sequence[Answer]) -> bool:
    """Wrong twice, or two of the last three, ending on a miss."""
    if not tail or tail[-1].correct:
        return False
    return sum(not a.correct for a in tail[-3:]) >= 2


def _step_down_target(graph, beliefs, node, skip) -> str | None:
    order = _order(graph)
    cands = [p for p in graph.prerequisites(node) if p not in skip]
    if not cands:
        return None

    def rank(p):
        b = beliefs[p]
        return (0 if b.n == 0 else 1 if b.status == "tentative" else 2 + b.mastery, order[p])

    return min(cands, key=rank)


def _drilldown(state, graph, beliefs, answers, proofs, skip) -> Action:
    T = state.focus_node or ""
    cur = state.current_node or T
    dr = [a for a in answers if a.phase == "drilldown"]
    proofs_T = [p for p in proofs if p.node_id == T]
    rnd = len(proofs_T)

    if len(dr) >= DRILL_CAP:
        return Action(kind="finish", phase="drilldown", reason="Question budget reached: root cause not confirmed.")
    if T in skip:
        return Action(kind="finish", phase="drilldown", reason=f"No usable question left on {T}: root cause not confirmed.")

    if rnd and proofs_T[-1].verdict != "verified" and not any(a.node_id == T and a.round == rnd for a in dr):
        if rnd > MAX_REOPENS:
            return Action(kind="finish", phase="drilldown",
                          reason=f"{T} still not verified after one reopen: root cause not confirmed.")
        wrongs = [a for a in dr if a.node_id == T and not a.correct]
        lvl = wrongs[-1].level if wrongs else 2
        return Action(kind="ask", phase="drilldown", node_id=T, level=lvl,
                      reason=f"Proof of {T} did not pass ({proofs_T[-1].note}). Reopening once.")

    if cur == T or cur in skip:
        tail = _tail(dr, T)
        # Ready for proof: two correct in a row since the last miss (or since the
        # climb back), one at L2+. Mastery over ALL evidence stays low for ever after
        # early misses, and the contrast pair is the real gate, so it is not used here.
        if len(tail) >= 2 and all(a.correct for a in tail[-2:]) and any(a.level >= 2 for a in tail[-2:]):
            return _proof(state, graph, beliefs, answers, proofs, skip)
        if not tail:
            return Action(kind="ask", phase="drilldown", node_id=T, level=2, reason=f"Continuing on {T}.")
        if _failing(tail):
            if state.hops >= MAX_HOPS:
                return Action(kind="finish", phase="drilldown",
                              reason=f"Missed {T} again and the hop limit ({MAX_HOPS}) is used: root cause not confirmed.")
            p = _step_down_target(graph, beliefs, T, skip)
            if p is None:
                return Action(kind="finish", phase="drilldown",
                              reason=f"Missed {T} again and it has no prerequisite left to test: root cause not confirmed.")
            lvl = 1 if beliefs[p].n == 0 or beliefs[p].mastery <= 0.5 else 2
            return Action(kind="step_down", phase="drilldown", node_id=p, level=lvl,
                          reason=f"Two misses on {T}: stepping DOWN to its prerequisite {p} to find the real gap.")
        last = tail[-1]
        if last.correct:
            lvl = min(3, last.level + 1)
            return Action(kind="ask", phase="drilldown", node_id=T, level=lvl,   # type: ignore[arg-type]
                          reason=f"Correct on {T} at L{last.level}: going up to L{lvl}.")
        return Action(kind="ask", phase="drilldown", node_id=T, level=last.level,
                      avoid_misconception=last.misconception_id,
                      reason=f"Missed {T} once: same level, a different angle.")

    # we are on a prerequisite
    P = cur
    tail = _tail(dr, P)
    mine = [a for a in dr if a.node_id == P]
    passed = (any(a.correct and a.level >= 2 for a in mine)
              or sum(a.correct and a.level == 1 for a in mine) >= 2)
    if passed:
        wrongs = [a for a in dr if a.node_id == T and not a.correct]
        lvl = wrongs[-1].level if wrongs else 2
        return Action(kind="climb_back", phase="drilldown", node_id=T, level=lvl,
                      reason=f"Prerequisite {P} holds up: climbing back to {T}.")
    if _failing(tail):
        if state.hops >= MAX_HOPS:
            return Action(kind="finish", phase="drilldown",
                          reason=f"{P} is weak too and the hop limit is used: deepest gap found is {P}, root cause not confirmed further.")
        q = _step_down_target(graph, beliefs, P, skip)
        if q is None:
            return Action(kind="finish", phase="drilldown",
                          reason=f"{P} is the deepest weak topic found (no prerequisite left to test).")
        lvl = 1 if beliefs[q].n == 0 or beliefs[q].mastery <= 0.5 else 2
        return Action(kind="step_down", phase="drilldown", node_id=q, level=lvl,
                      reason=f"{P} is weak too: stepping down again to {q}.")
    if not tail:
        return Action(kind="ask", phase="drilldown", node_id=P, level=1, reason=f"Testing prerequisite {P}.")
    last = tail[-1]
    if last.correct:
        return Action(kind="ask", phase="drilldown", node_id=P, level=min(2, last.level + 1),  # type: ignore[arg-type]
                      reason=f"Correct on {P}: one more question to be sure.")
    return Action(kind="ask", phase="drilldown", node_id=P, level=last.level,
                  avoid_misconception=last.misconception_id,
                  reason=f"Missed {P} once: same level, a different angle.")


def diagnosed_misconception(answers: Sequence[Answer], node_id: str) -> str | None:
    """The most frequent misconception tag among wrong answers on the node."""
    counts: dict[str, int] = {}
    for a in answers:
        if a.node_id == node_id and not a.correct and a.misconception_id:
            counts[a.misconception_id] = counts.get(a.misconception_id, 0) + 1
    if not counts:
        return None
    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]


def _proof(state, graph, beliefs, answers, proofs, skip) -> Action:
    T = state.focus_node or ""
    proofs_T = [p for p in proofs if p.node_id == T]
    rnd = len(proofs_T)
    if proofs_T and proofs_T[-1].verdict == "verified":
        return Action(kind="finish", phase="proof", reason=f"{T} verified by a contrast pair.")
    if rnd > MAX_REOPENS:
        return Action(kind="finish", phase="proof", reason=f"{T} not verified after one reopen: root cause not confirmed.")
    if proofs_T and not any(a.phase == "drilldown" and a.node_id == T and a.round == rnd for a in answers):
        return _drilldown(state, graph, beliefs, answers, proofs, skip)      # the reopen
    m = diagnosed_misconception(answers, T)
    have = {a.role for a in answers if a.phase == "proof" and a.node_id == T and a.round == rnd}
    if {"discriminating", "control"} <= have:
        return Action(kind="resolve", phase="proof", node_id=T, misconception_id=m,
                      reason=f"Both proof questions answered for {T}: scoring the contrast.")
    roles = ["discriminating", "control"]
    if zlib.crc32(f"{T}:{rnd}".encode()) % 2:
        roles.reverse()
    for role in roles:
        if role not in have:
            return Action(kind="ask", phase="proof", node_id=T, role=role, misconception_id=m,  # type: ignore[arg-type]
                          reason=f"Proof of repair on {T}: a question where the belief fails, and a control where it does not.")
    return Action(kind="finish", phase="proof", reason="Proof complete.")
