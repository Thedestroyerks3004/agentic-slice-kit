"""The student session on the spine.

Code decides every step (engine.next_action); the model is used in exactly one
place, the diagnoser, once per node. State lives in the store as immutable
records, so a killed process resumes from the database.

States used: PROBING (code decides), AWAITING_EXPERT (waiting on the student),
COMPLETE, FAILED. The pedagogical phase lives in the `session` record.

Two counters, never one: spend (slice.budget) and revisions (hops and proof
rounds, counted here from the record history and handed to the engine).

Record kinds: input, session, action, served, answer, unanswered, reask, choice,
flag, prediction, prediction_result, edge_weight, hypothesis, proof, memory, failure.
"""
from __future__ import annotations

import json
from types import SimpleNamespace

from slice import callback
from slice.records import RunState

from . import config, content, engine, memory
from .chunks import make_retriever
from .diagnoser import diagnose
from .schema import (Action, Answer, Graph, Prediction, ProofResult, Question, SessionState)

MAX_REASKS = 2
INTERNAL_STEPS = 8


# ------------------------------------------------------------------ start

def start(store, topic: str, graph: Graph | None = None, student: str = "student") -> str:
    """Create a run. `graph` is given only for a custom, approved graph."""
    graph = graph or content.load_graph(topic)
    run = store.create_run("syllabusmind", {"topic": topic, "student": student})
    store.append(run, "input", {"topic": topic, "graph_hash": graph.graph_hash()}, "student")
    mem = memory.load(graph.graph_hash())
    refresh = memory.verified_nodes(mem)[:2]
    for key, w in (mem.get("edge_weights") or {}).items():
        store.append(run, "edge_weight", {"key": key, "weight": w, "why": "carried from last session"}, "memory")
    sess = SessionState(topic=topic, graph_hash=graph.graph_hash(), refresh=refresh,
                        phase="refresh" if refresh else "diagnostic")
    store.append(run, "session", sess.model_dump(), "system")
    store.set_state(run, RunState.PROBING)
    return run


# ---------------------------------------------------------------- snapshot

class Snap(SimpleNamespace):
    """Everything derived from the record history. Nothing is held in memory."""


def snapshot(ctx) -> Snap:
    topic = ctx.latest("input")["topic"]
    g0 = content.load_graph(topic)
    pool = content.load_pool(topic, g0)
    weights = {}
    for v in ctx.history("edge_weight"):
        weights[v.payload["key"]] = v.payload["weight"]
    graph = g0.model_copy(update={"edges": [
        e.model_copy(update={"weight": weights.get(f"{e.source}->{e.target}", e.weight)}) for e in g0.edges]})
    answers = [Answer.model_validate(v.payload) for v in ctx.history("answer")]
    proofs = [ProofResult.model_validate(v.payload) for v in ctx.history("proof")]
    results = {v.payload["id"]: v.payload["outcome"] for v in ctx.history("prediction_result")}
    preds = []
    for v in ctx.history("prediction"):
        p = Prediction.model_validate(v.payload)
        preds.append(p.model_copy(update={"outcome": results.get(p.id)}))
    unanswered = [v.payload["node_id"] for v in ctx.history("unanswered")]
    exhausted = [v.payload["node_id"] for v in ctx.history("exhausted")]
    st = SessionState.model_validate(ctx.latest("session"))
    hops = sum(1 for v in ctx.history("action") if v.payload.get("kind") == "step_down")
    st = st.model_copy(update={"unanswered_nodes": sorted(set(unanswered)),
                               "exhausted_nodes": sorted(set(exhausted)),
                               "hops": hops, "theta": engine.theta_from(answers)})
    verified = {p.node_id for p in proofs if p.verdict == "verified"}
    beliefs = engine.all_beliefs(graph, answers, verified)
    flagged = {v.payload["question_id"] for v in ctx.history("flag")}
    return Snap(graph=graph, pool=pool, answers=answers, proofs=proofs, preds=preds,
                state=st, beliefs=beliefs, flagged=flagged,
                served=[v.payload for v in ctx.history("served")])


def _save(ctx, st: SessionState) -> None:
    ctx.append("session", st.model_dump(), "system")


# ------------------------------------------------------------ reply parsing

def parse_reply(text: str | None) -> dict | None:
    """The human boundary: prose/JSON from the page becomes a typed reply or None."""
    try:
        d = json.loads(text or "")
    except (ValueError, TypeError):
        return None
    if not isinstance(d, dict):
        return None
    if d.get("flag") is True:
        return {"flag": True}
    if "choose" in d:
        return {"choose": str(d["choose"])}
    if d.get("choice") in ("A", "B", "C", "D") and d.get("confidence") in ("guessing", "fairly_sure", "certain"):
        return {"choice": d["choice"], "confidence": d["confidence"]}
    return None


def encode_reply(**kw) -> str:
    return json.dumps(kw)


# ---------------------------------------------------------- pick a question

def pick(snap: Snap, a: Action) -> Question | None:
    used = {s["question_id"] for s in snap.served if s.get("question_id")}
    c = [q for q in snap.pool.usable() if q.node_id == a.node_id and q.role == a.role
         and q.id not in used and q.id not in snap.flagged]
    if a.role != "standard" and a.misconception_id:
        exact = [q for q in c if q.probes == a.misconception_id]
        c = exact or c
    if not c:
        return None
    lvl = a.level or 2
    return min(c, key=lambda q: (q.probes == a.avoid_misconception and a.avoid_misconception is not None,
                                 abs(q.level - lvl), q.level > lvl, q.id))


# ------------------------------------------------------------------ handler

def build_flow(call, retriever=None):
    """`call` is injected (openai_llm.complete or stub.Stub), so the whole state
    machine runs with no key and no network."""

    def _retriever(ctx):
        return retriever or make_retriever(content.corpus_dir(ctx.latest("input")["topic"]))

    def _serve(ctx, qid_kind: str, payload: dict, text: str, options=None) -> RunState:
        qid = callback.ask(ctx.store, ctx.run_id, text,
                           {"resume_state": RunState.PROBING.value, "kind": qid_kind, **payload}, ctx.settings)
        ctx.append("served", {"qid": qid, "kind": qid_kind, **payload}, "system")
        return RunState.AWAITING_EXPERT

    # ---- 1. turn the pending reply into a typed record -------------------
    def _resolve_pending(ctx) -> RunState | None:
        served = ctx.history("served")
        done = {v.payload["qid"] for k in ("answer", "unanswered", "reask", "choice")
                for v in ctx.history(k)}
        if not served or served[-1].payload["qid"] in done:
            return None
        s = served[-1].payload
        reply = next((v.payload for v in ctx.history("expert_answer")
                      if v.payload.get("question_id") == s["qid"]), None)
        if reply is None:
            return RunState.AWAITING_EXPERT
        node = s.get("node_id")
        if reply.get("answer") is None:                       # timed out: unassessed, stated
            ctx.append("unanswered", {"qid": s["qid"], "node_id": node,
                                      "question_id": s.get("question_id"), "kind": s["kind"]}, "system")
            return None
        r = parse_reply(reply["answer"])
        if r and r.get("flag") and s["kind"] == "question":
            ctx.append("flag", {"question_id": s["question_id"]}, "student")
            ctx.append("reask", {"qid": s["qid"], "why": "flagged by the student; substituting"}, "system")
            return None
        if s["kind"] == "choose" and r and "choose" in r:
            snap = snapshot(ctx)
            ok = r["choose"] == "auto" or r["choose"] in {n.id for n in snap.graph.nodes}
            if ok:
                ctx.append("choice", {"qid": s["qid"], "node_id": None if r["choose"] == "auto" else r["choose"]}, "student")
                st = snap.state
                if r["choose"] != "auto":
                    st = st.model_copy(update={"focus_node": r["choose"], "current_node": r["choose"]})
                _save(ctx, st)
                return None
            r = None
        if s["kind"] == "question" and r and "choice" in r:
            snap = snapshot(ctx)
            q = next(q for q in snap.pool.questions if q.id == s["question_id"])
            opt = next(o for o in q.options if o.key == r["choice"])
            rnd = sum(1 for p in snap.proofs if p.node_id == snap.state.focus_node) if snap.state.phase in ("drilldown", "proof") else 0
            ans = Answer(question_id=q.id, node_id=q.node_id, level=q.level, chosen=r["choice"],
                         correct=r["choice"] == q.correct, confidence=r["confidence"],
                         misconception_id=opt.misconception_id, role=q.role,
                         phase=s["phase"], round=rnd)
            ctx.append("answer", {**ans.model_dump(), "qid": s["qid"]}, "student")
            return None
        # unparsable: re-ask, never guess
        n = sum(1 for v in ctx.history("reask") if v.payload.get("question_id") == s.get("question_id"))
        if n >= MAX_REASKS:
            ctx.append("unanswered", {"qid": s["qid"], "node_id": node, "question_id": s.get("question_id"),
                                      "kind": s["kind"], "why": "unreadable reply"}, "system")
            return None
        ctx.append("reask", {"qid": s["qid"], "question_id": s.get("question_id"), "why": "unreadable reply"}, "system")
        return _serve(ctx, s["kind"], {k: v for k, v in s.items() if k not in ("qid", "kind")},
                      "Please answer again.")

    # ---- 2. act on the engine's decision ---------------------------------
    def _act(ctx) -> RunState | None:
        snap = snapshot(ctx)
        st, g = snap.state, snap.graph
        a = engine.next_action(st, g, snap.beliefs, snap.answers, snap.preds, snap.proofs)
        ctx.append("action", {**a.model_dump(), "n_answers": len(snap.answers)}, "engine")

        if a.kind == "ask" and a.phase == "drilldown" and snap.state.phase != "drilldown"                 and not any(x["kind"] == "choose" for x in snap.served):
            # entering the drilldown: the student picks the concept (or lets the agent pick)
            return _serve(ctx, "choose", {"candidates": [n.id for n in g.nodes]}, "Which concept should we work on?")

        if a.phase and a.phase != st.phase:
            st = st.model_copy(update={"phase": a.phase})
            if a.phase == "drilldown" and a.focus_node:
                st = st.model_copy(update={"focus_node": a.focus_node, "current_node": a.focus_node})
            _save(ctx, st)

        if a.kind == "finish":
            _save(ctx, st.model_copy(update={"finished": True}))
            memory.save_run(ctx, snap)
            return RunState.COMPLETE

        if a.kind == "predict":
            for p in engine.predict_candidates(g, snap.beliefs):
                ctx.append("prediction", p.model_dump(), "engine")
            _save(ctx, st.model_copy(update={"predicted": True}))
            return None

        if a.kind == "resolve" and a.phase == "verify":
            p = next(p for p in snap.preds if p.id == a.prediction_id)
            res = engine.resolve_prediction(p, snap.beliefs[p.target_id])
            ctx.append("prediction_result", {"id": p.id, "outcome": res.outcome}, "engine")
            key = f"{p.source_id}->{p.target_id}"
            w = next(e.weight for e in g.edges if f"{e.source}->{e.target}" == key) if any(
                f"{e.source}->{e.target}" == key for e in g.edges) else None
            if w is not None:
                nw = engine.reweight_edge_weight(w, res.outcome)
                ctx.append("edge_weight", {"key": key, "weight": round(nw, 3), "why": f"prediction {res.outcome}"}, "engine")
            return None

        if a.kind == "resolve" and a.phase == "proof":
            rnd = sum(1 for p in snap.proofs if p.node_id == a.node_id)
            pa = [x for x in snap.answers if x.phase == "proof" and x.node_id == a.node_id and x.round == rnd]
            d = next(x.correct for x in pa if x.role == "discriminating")
            c = next(x.correct for x in pa if x.role == "control")
            ctx.append("proof", engine.contrast_verdict(a.node_id, a.misconception_id, d, c).model_dump(), "engine")
            return None

        # ask / step_down / climb_back: serve a question
        q = pick(snap, a)
        if q is None:
            if a.phase == "proof":
                ctx.append("proof", ProofResult(node_id=a.node_id or "", misconception_id=a.misconception_id,
                                                verdict="not_repaired",
                                                note="no unused contrast pair left in the pool").model_dump(), "engine")
            else:
                ctx.append("exhausted", {"node_id": a.node_id, "why": "no unused question at this role"}, "engine")
            return None
        if a.kind == "step_down":
            _diagnose(ctx, snap, st.focus_node or a.node_id)
            st = st.model_copy(update={"current_node": a.node_id})
            _save(ctx, st)
        elif a.kind == "climb_back":
            _save(ctx, st.model_copy(update={"current_node": a.node_id}))
        return _serve(ctx, "question",
                      {"question_id": q.id, "node_id": q.node_id, "phase": a.phase or st.phase}, q.stem)

    def _diagnose(ctx, snap, node_id):
        if not node_id or any(v.payload["node_id"] == node_id for v in ctx.history("hypothesis")):
            return
        h = diagnose(ctx, call, _retriever(ctx), snap.graph, node_id, snap.answers)
        ctx.append("hypothesis", h.model_dump(), "agent:diagnoser")

    def handle_probing(ctx) -> RunState:
        early = _resolve_pending(ctx)
        if early is not None:
            return early
        for _ in range(INTERNAL_STEPS):
            nxt = _act(ctx)
            if nxt is not None:
                return nxt
        ctx.append("failure", {"kind": "no_progress", "detail": "engine produced no question in 8 steps"}, "system")
        return RunState.FAILED

    return SimpleNamespace(name="syllabusmind", handlers={RunState.PROBING: handle_probing})
