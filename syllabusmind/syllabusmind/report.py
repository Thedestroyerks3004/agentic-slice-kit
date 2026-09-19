"""Numbers only, from the records. Predictions are counts, never percentages;
unassessed nodes are listed, never zeroed; a question nobody answered is stated."""
from __future__ import annotations

from slice.budget import Budget

from . import engine, memory, session_flow
from .schema import Report


def build(ctx) -> Report:
    s = session_flow.snapshot(ctx)
    o = engine.overall_score(s.graph, s.beliefs)
    preds = [p for p in s.preds if p.outcome in ("confirmed", "refuted")]
    proofs = {}
    for p in s.proofs:
        proofs[p.node_id] = p.verdict
    unassessed = [n for n, b in s.beliefs.items() if b.n == 0]
    fin = next((v.payload["reason"] for v in reversed(ctx.history("action"))
                if v.payload["kind"] == "finish"), "")
    hyp = [v.payload for v in ctx.history("hypothesis")]
    causes = [f'{h["node_id"]}: {h["statement"]}' for h in hyp if h["status"] == "supported"]
    ua = len(ctx.history("unanswered"))
    caveats = ["Difficulty levels are labelled by the question author, not calibrated on students.",
               "A short diagnostic is a coarse map, not a measurement of mastery."]
    if unassessed:
        caveats.append(f"{len(unassessed)} topic(s) were never assessed and are excluded from the score.")
    if ua:
        caveats.append(f"We asked {ua} question(s) and nobody answered; those topics stay unassessed.")
    unsup = [h["node_id"] for h in hyp if h["status"] != "supported"]
    if unsup:
        caveats.append("Could not establish a cited cause for: " + ", ".join(unsup))
    if len(preds) < 3:
        caveats.append("Prediction sample is tiny; counts only.")
    return Report(
        topic=s.state.topic, graph_hash=s.state.graph_hash,
        overall=o.overall, low=o.low, high=o.high, coverage=o.coverage,
        questions_asked=len(s.answers),
        predictions_confirmed=sum(p.outcome == "confirmed" for p in preds),
        predictions_refuted=sum(p.outcome == "refuted" for p in preds),
        predictions_total=len(s.preds),
        verified_nodes=[n for n, v in proofs.items() if v == "verified"],
        improving_nodes=[n for n, v in proofs.items() if v == "improving"],
        danger_nodes=[n for n, b in s.beliefs.items() if b.danger],
        unassessed_nodes=unassessed, unanswered_questions=ua,
        calibration_flags=engine.calibration_flags(s.answers),
        root_causes=causes, memory=memory.outcomes(s), finished_reason=fin, caveats=caveats)
