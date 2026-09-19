"""The student web app: JSON API plus one static page. Run with

    python -m syllabusmind serve

The student's reply is never free text: an option key plus one of three
confidence values, converted into a typed Answer by the flow before anything
reads it."""
from __future__ import annotations

import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from slice import callback
from slice.runner import advance, Context
from slice.store import Store

from .. import config, content, report, session_flow, stub
from ..schema import Graph

STATIC = Path(__file__).parent / "static"
app = FastAPI(title="SyllabusMind")
_lock = threading.Lock()
_STUB = stub.Stub()


def _call():
    cfg = config.load()
    if cfg.live:
        from .. import openai_llm
        return openai_llm.complete
    return _STUB


def _flow():
    return session_flow.build_flow(_call())


def _store() -> Store:
    return Store(config.load().db)


class NewRun(BaseModel):
    topic: str
    student: str = "student"


class Reply(BaseModel):
    choice: str | None = None
    confidence: str | None = None
    choose: str | None = None
    flag: bool = False


def _step(store: Store, run_id: str):
    return advance(store, run_id, _flow(), config.load().spine)


def _layers(g: Graph) -> dict[str, int]:
    depth: dict[str, int] = {}

    def d(n: str) -> int:
        if n not in depth:
            depth[n] = 0
            pre = g.prerequisites(n)
            depth[n] = 1 + max((d(p) for p in pre), default=-1)
        return depth[n]

    return {n.id: d(n.id) for n in g.nodes}


def view(store: Store, run_id: str) -> dict:
    state = store.get_state(run_id)
    ctx = Context(store, run_id, config.load().spine)
    s = session_flow.snapshot(ctx)
    g, layers = s.graph, _layers(s.graph)
    qs = {q.id: q for q in s.pool.questions}
    evidence: dict[str, list] = {n.id: [] for n in g.nodes}
    for a in s.answers:
        q = qs[a.question_id]
        ch = next(o for o in q.options if o.key == a.chosen)
        evidence[a.node_id].append({
            "stem": q.stem, "chosen": ch.text, "correct": a.correct, "level": a.level,
            "confidence": a.confidence, "phase": a.phase, "role": a.role,
            "belief": g.belief_text(a.misconception_id) if a.misconception_id else "",
            "right": next(o.text for o in q.options if o.key == q.correct),
            "why": q.explanation})
    nodes = []
    for n in g.nodes:
        b = s.beliefs[n.id]
        nodes.append({"id": n.id, "name": n.name, "unit": n.unit, "layer": layers[n.id],
                      "status": b.status, "danger": b.danger, "n": b.n,
                      "mastery": round(b.mastery, 2), "low": round(b.low, 2), "high": round(b.high, 2),
                      "trust": round(1 - (b.high - b.low), 2) if b.n else None,
                      "weak_links": [g.node(p).name for p in g.prerequisites(n.id)
                                     if s.beliefs[p].status in ("weak", "shaky") or s.beliefs[p].danger],
                      "evidence": evidence[n.id],
                      "beliefs": [m.belief for m in g.misconceptions_of(n.id)]})
    pending = callback.pending(store, run_id)
    question = None
    if pending and state.value == "awaiting_expert":
        p = pending[0]
        ctxq = p.context
        if ctxq["kind"] == "choose":
            question = {"qid": p.id, "kind": "choose", "candidates": ctxq["candidates"]}
        else:
            q = qs[ctxq["question_id"]]
            question = {"qid": p.id, "kind": "question", "stem": q.stem, "level": q.level,
                        "node": g.node(q.node_id).name, "node_id": q.node_id, "phase": ctxq["phase"],
                        "role": q.role, "options": [{"key": o.key, "text": o.text} for o in q.options],
                        "expires_at": p.timeout_at}
    last = None
    if s.answers:
        a = s.answers[-1]
        lq = qs[a.question_id]
        last = {"correct": a.correct, "node": g.node(a.node_id).name, "stem": lq.stem, "confidence": a.confidence,
                "chosen": next(o.text for o in lq.options if o.key == a.chosen),
                "right": next(o.text for o in lq.options if o.key == lq.correct),
                "why": lq.explanation, "belief": g.belief_text(a.misconception_id) if a.misconception_id else ""}
    log = [{"seq": v.seq, "kind": v.payload["kind"], "phase": v.payload.get("phase"),
            "node": v.payload.get("node_id"), "reason": v.payload["reason"]}
           for v in ctx.history("action")]
    log += [{"seq": v.seq, "kind": "hypothesis", "node": v.payload["node_id"],
             "reason": (v.payload["statement"] or "No cause established")
             + (f'  [{v.payload["citation"]["cite"]}: "{v.payload["citation"]["quote"]}"]'
                if v.payload["status"] == "supported" else f'  (could not establish: {v.payload["note"]})')}
            for v in ctx.history("hypothesis")]
    log.sort(key=lambda x: x["seq"])
    done = state.is_terminal
    return {
        "run_id": run_id, "state": state.value, "phase": s.state.phase, "topic": s.state.topic,
        "title": g.title, "graph_hash": s.state.graph_hash, "mode": "live" if config.load().live else "stub",
        "nodes": nodes,
        "edges": [{"from": e.source, "to": e.target, "weight": round(e.weight, 2)} for e in g.edges],
        "question": question, "last": last, "log": log, "answered": len(s.answers),
        "predictions": [p.model_dump() for p in s.preds],
        "pool": {"generated": s.pool.generated, "rejected": s.pool.rejected, "usable": len(s.pool.usable())},
        "tokens": ctx.budget.summary()["tokens_used"],
        "failure": (ctx.latest("failure") or {}).get("detail") if state.value == "failed" else None,
        "report": report.build(ctx).model_dump() if done and state.value == "complete" else None,
    }


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/topics")
def topics():
    out = []
    for t in content.topics():
        g = content.load_graph(t)
        out.append({"topic": t, "title": g.title, "nodes": len(g.nodes),
                    "questions": len(content.load_pool(t, g).usable())})
    return {"topics": out, "mode": "live" if config.load().live else "stub"}


@app.post("/api/runs")
def new_run(body: NewRun):
    if body.topic not in content.topics():
        raise HTTPException(404, "unknown topic")
    with _lock:
        store = _store()
        run = session_flow.start(store, body.topic, student=body.student[:40])
        _step(store, run)
        return view(store, run)


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    store = _store()
    try:
        store.meta(run_id)
    except Exception:
        raise HTTPException(404, "unknown run")
    with _lock:
        _step(store, run_id)            # sweeps expired questions, then resumes if needed
        return view(store, run_id)


@app.post("/api/runs/{run_id}/reply")
def reply(run_id: str, body: Reply):
    """Validate at the edge (an outside value is rejected, not guessed), then hand
    the flow a typed reply through the spine's callback."""
    store = _store()
    open_q = callback.pending(store, run_id)
    if not open_q:
        raise HTTPException(409, "no question is waiting (it may have expired or been answered)")
    q = open_q[0]
    if body.flag:
        text = session_flow.encode_reply(flag=True)
    elif body.choose is not None:
        text = session_flow.encode_reply(choose=body.choose)
    elif body.choice in ("A", "B", "C", "D") and body.confidence in ("guessing", "fairly_sure", "certain"):
        text = session_flow.encode_reply(choice=body.choice, confidence=body.confidence)
    else:
        raise HTTPException(422, "choose an option and one of: guessing, fairly_sure, certain")
    with _lock:
        callback.answer(store, q.id, text, who="student")
        _step(store, run_id)
        return view(store, run_id)
