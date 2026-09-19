"""Memory across sessions, keyed on the approved graph's hash: verified nodes
(with a date), misconception status, and edge weights. A later session loads it
instead of starting from zero and re-tests each verified node once."""
from __future__ import annotations

import json
import time
from pathlib import Path

from . import config


def _path(graph_hash: str) -> Path:
    d = Path(config.load().memory_dir)
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{graph_hash}.json"


def load(graph_hash: str) -> dict:
    try:
        return json.loads(_path(graph_hash).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def verified_nodes(mem: dict) -> list[str]:
    return [n for n, v in (mem.get("nodes") or {}).items() if v.get("status") == "verified"]


def outcomes(snap) -> dict[str, str]:
    """Refresh questions: holds or regressed, per node."""
    return {a.node_id: ("holds" if a.correct else "regressed")
            for a in snap.answers if a.phase == "refresh"}


def save_run(ctx, snap) -> None:
    gh = snap.state.graph_hash
    mem = load(gh)
    nodes = mem.setdefault("nodes", {})
    for n, res in outcomes(snap).items():
        if res == "regressed":
            nodes[n] = {"status": "regressed", "at": time.strftime("%Y-%m-%d")}
    for p in snap.proofs:
        if p.verdict == "verified":
            nodes[p.node_id] = {"status": "verified", "at": time.strftime("%Y-%m-%d"),
                                "misconception": p.misconception_id}
    mem["edge_weights"] = {f"{e.source}->{e.target}": round(e.weight, 3) for e in snap.graph.edges}
    _path(gh).write_text(json.dumps(mem, indent=1), encoding="utf-8")
    ctx.append("memory", {"saved_nodes": sorted(nodes), "outcomes": outcomes(snap)}, "system")
