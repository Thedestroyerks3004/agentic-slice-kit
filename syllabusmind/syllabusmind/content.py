"""Load frozen, reviewed graphs and question pools. A pool whose graph_hash no
longer matches its graph is refused: questions written for another graph must not
be served against this one."""
from __future__ import annotations

from pathlib import Path

from .schema import Graph, QuestionPool

ROOT = Path(__file__).resolve().parent
DATA, CORPUS = ROOT / "data", ROOT / "corpus"


class StalePool(ValueError):
    pass


def topics() -> list[str]:
    return sorted(p.stem for p in (DATA / "graphs").glob("*.json"))


def load_graph(topic: str) -> Graph:
    return Graph.model_validate_json((DATA / "graphs" / f"{topic}.json").read_text(encoding="utf-8"))


def load_pool(topic: str, graph: Graph | None = None) -> QuestionPool:
    graph = graph or load_graph(topic)
    pool = QuestionPool.model_validate_json((DATA / "pools" / f"{topic}.json").read_text(encoding="utf-8"))
    if pool.graph_hash != graph.graph_hash():
        raise StalePool(f"pool for {topic!r} was built for graph {pool.graph_hash}, not {graph.graph_hash()}")
    return pool


def corpus_dir(topic: str) -> Path:
    return CORPUS / topic
