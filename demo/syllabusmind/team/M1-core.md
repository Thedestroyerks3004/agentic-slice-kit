# M1 Core: the contract and the rules

**You own the shared records and every rule the system enforces.** Everyone else
codes against what you write, so your first job is to unblock them, not to make it
perfect. Read [`MODULES.md`](../MODULES.md) first, then this.

**Your files:** `schema.py`, `engine.py`, `tests/test_syllabusmind_engine.py`.
**You do not touch:** `slice/`, the prompts, the corpus, the web app.

---

## Why your module matters for the marks

- **35 pts, working agentic slice:** the back-edge (step down to a prerequisite,
  climb back, reopen a failed proof) is decided by `next_action`. That function
  *is* the visible loop.
- **Trust:** every score and every next step is deterministic Python. A judge can
  ask "why did it do that?" and the answer must be a function you can point at.
- The engine is pure: no I/O, no model, no store, no clock. That is what makes it
  testable in milliseconds and explainable in twenty seconds.

## Order of work

### 1. Freeze `schema.py` v1 (first 45 minutes, before anything else)

Three people are waiting on it. Write it, share it, then only change it by
announcing in the group. Records to define (pydantic, bounds in the schema, not in
prompts):

| record | fields to settle |
|---|---|
| `Node`, `Edge`, `Graph` | edge = `source` is a prerequisite of `target`, `weight` 0.1 to 1; `Graph.graph_hash()` for memory across sessions |
| `Misconception` | id, node, one-line belief |
| `Question`, `Option`, `Citation` | 4 options exactly; distractors carry a `misconception_id`; `role` = standard / discriminating / control with a `pair_id`; `source` = cite + verbatim quote; `status` = verified / demoted / rejected with a `note` |
| `QuestionBatch`, `Verdict`, `Objection` | **wrap lists** (`items: list[X] = Field(min_length, max_length)`); a bare list is not a schema. `Verdict.status` is PASS or BLOCK |
| `Answer` | question, node, level, chosen, correct, **confidence** (guessing / fairly_sure / certain), misconception tag, phase |
| `NodeBelief` | alpha, beta, n, mastery, low, high, status, danger |
| `Prediction` | written before testing, never edited |
| `Hypothesis`, `ProofResult` | diagnoser output; proof outcome |
| `SessionState`, `Action`, `Report` | control record; what `next_action` returns; numbers-only report |

Also agree, in writing, the **record kinds** written to the store (M3 writes them,
M4 reads them): `session`, `answer`, `belief`, `prediction`, `hypothesis`, `proof`.
Put that list at the top of `schema.py`.

### 2. Write the walkthrough by hand (with M2, before `engine.py` gets clever)

One whole session with real values, for one DBMS misconception (for example "any
cycle in a wait-for graph means deadlock"): the actual answers, confidences,
beliefs, the prediction, the step-down, the climb-back and the proof. Save it as
`docs/evidence/walkthrough-target.md`. It becomes your test, the demo script and
the target for everyone's prompts. If the running system later disagrees with it,
one of the two is wrong: decide which, out loud, before changing code.

### 3. `engine.py`, as pure functions

Constants live at the top (they are this domain's opinions, not architecture).

| function | rule |
|---|---|
| `node_belief(node_id, answers)` | weights L1 0.6, L2 1.0, L3 1.4; a correct answer tagged `guessing` counts half. `alpha = 1 + sum(w*y)`, `beta = 1 + sum(w*(1-y))`, `mastery = alpha/(alpha+beta)`; 90% range by the normal approximation. **Zero answers gives status `unknown`, never mastery 0.** One answer is `tentative`. Weak: mastery under 0.40 with 2+ answers. Solid: over 0.70 with 2+ answers |
| `is_danger(answers)` | a wrong answer at `certain`, or two wrong at `fairly_sure` |
| `update_theta`, `next_level` | `P = 0.25 + 0.75*sigmoid(theta - b)`, b = -1/0/+1; `theta += k*(y-P)` with k decaying 0.4 to 0.15; next level is the one whose P is closest to 0.65 |
| `predict_candidates(graph, beliefs)` | for each dependent d with at most 1 answer: `edgeWeight * (1 - mastery(source)) * (1.0 if danger else 0.7) / distance`. Top 2 or 3 |
| `resolve_prediction`, `reweight_edge` | confirmed if the target's mastery is under 0.5 after testing; `w += 0.25*(outcome - w)`, clipped 0.1 to 1 |
| `contrast_verdict` | both correct: verified. **Only the control correct: not_repaired** (the signature of a guess). Only the discriminating one: improving |
| `overall_score(graph, beliefs)` | `nodeWeight = 1 + dependents`; mean over **assessed nodes only**; return range and coverage. Counts, never percentages, for predictions |
| `next_action(state, graph, beliefs, answers, predictions)` | see below |

### `next_action` (the important one)

It returns an `Action` (`ask`, `predict`, `step_down`, `climb_back`, `proof`,
`finish`) **with a plain-language `reason`**, because the reason is what appears in
the agent log the judges watch.

- Diagnostic: coverage first (unassessed nodes with the most dependents), level from
  theta, at most 3 follow-up questions after a wrong answer, stop at 15 questions or
  at 12 if every central node has an answer.
- Drilldown on a focus node: start at L1 if weak, L2 otherwise; correct goes up a
  level; wrong once tries a different angle; **wrong twice (or 2 of the last 3)
  steps down** to the lowest-mastery prerequisite; a passed prerequisite climbs
  back; hop limit 2; then proof.
- Proof failed reopens once, then ends as "root cause not confirmed".

**The rule that will bite you:** hop and reopen counts arrive inside `state`,
already counted by M3 from record history. `engine.py` never reads `slice.budget`.
A spend limit and a revision limit are two different numbers and must not share a
counter, or a retried model call quietly eats a hop.

## Tests (you are the only module where every rule has a test)

At minimum: guess weighting; unknown is excluded from the score and never zero;
mastery boundaries; danger rule; contrast-pair table (all four cases, especially
control-only); hop limit stops at 2; reopen limit stops at 1; prediction is
confirmed/refuted correctly; a fixed answer script replays to identical output
twice (determinism). One test must feed `next_action` a wrong-wrong sequence and
assert `step_down`.

## Done when

- Everything in `engine.py` has a passing test, and `python -m pytest` stays green.
- M3 can call `next_action` from the stub loop and see the back-edge with no model.
- Optional after that, only if there is time: a simulated-student harness with a
  planted weak node, labelled as simulation.

## Traps

- Do not put mastery numbers in a prompt or ask a model for a state. The model never
  produces a score.
- `latest` is not "current" for per-node records: read the full history and take the
  newest per node.
- Do not claim more than 12 questions can support. The range and coverage are the
  honest answer; keep them.

## Commit rhythm

Push at 11:00, 14:00 and 17:00, even half finished. Schema v1 should be in the 11:00
push.
