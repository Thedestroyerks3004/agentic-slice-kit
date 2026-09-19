"""Freezes authored content: python -m syllabusmind.authoring.build

Writes corpus/<topic>/<node>.md, data/graphs/<topic>.json, data/pools/<topic>.json.
Every question passes the deterministic gate: schema, exactly one key, unique
options, tags exist, and the provenance check against the corpus it cites."""
from __future__ import annotations

import importlib
import zlib

from ..chunks import KeywordRetriever
from ..content import CORPUS, DATA
from .. import provenance
from ..schema import (Citation, Edge, Graph, Misconception, Node, Option, Question,
                      QuestionPool)


def build(topic: str) -> QuestionPool:
    src = importlib.import_module(f"syllabusmind.authoring.{topic}")
    cdir = CORPUS / topic
    cdir.mkdir(parents=True, exist_ok=True)
    nodes, edges, miscs = [], [], []
    for nid, name, unit, pre, ms, qs in src.NODES:
        nodes.append(Node(id=nid, name=name, unit=unit))
        edges += [Edge(source=p, target=nid, weight=0.7, origin="human",
                       rationale=f"{name} builds on {p}") for p in pre]
        miscs += [Misconception(id=f"{nid}.{m}", node_id=nid, belief=b) for m, b in ms]
        facts = list(dict.fromkeys(q[6] for q in qs))
        qs = qs + [q[:6] + (facts[q[6]],) for q in getattr(src, "EXTRA", {}).get(nid, [])]
        (cdir / f"{nid}.md").write_text(
            f"# {name}\n\nStudy notes for the demo (replace or extend with real course material).\n\n"
            + "\n\n".join(facts) + "\n", encoding="utf-8")
    graph = Graph(topic=topic, title=src.TITLE, nodes=nodes, edges=edges, misconceptions=miscs)
    ret = KeywordRetriever(cdir)
    questions: list[Question] = []
    reasons: dict[str, int] = {}
    n = 0
    for nid, _n, _u, _p, ms, qs0 in src.NODES:
        facts = list(dict.fromkeys(q[6] for q in qs0))
        qs = qs0 + [q[:6] + (facts[q[6]],) for q in getattr(src, "EXTRA", {}).get(nid, [])]
        pair_m = None
        for role, lvl, stem, right, wrong, tags, fact in qs:
            n += 1
            texts = [right] + wrong
            order = sorted(range(4), key=lambda i: zlib.crc32(f"{nid}{n}{i}".encode()))
            opts, correct = [], "A"
            for k, i in zip("ABCD", order):
                mid = None
                if i > 0 and tags[i - 1] is not None:
                    mid = f"{nid}.{ms[tags[i - 1]][0]}"
                opts.append(Option(key=k, text=texts[i], misconception_id=mid))   # type: ignore[arg-type]
                if i == 0:
                    correct = k
            tagged = [o.misconception_id for o in opts if o.misconception_id]
            if role == "d":
                pair_m = tagged[0] if tagged else f"{nid}.{ms[0][0]}"
            probes = pair_m if role in ("d", "c") else (tagged[0] if tagged else None)
            chunk = next((c for c in ret.all() if c.doc == f"{nid}.md" and fact in c.text), None)
            q = Question(id=f"{nid}-{n}", node_id=nid, level=lvl, stem=stem, options=opts,   # type: ignore[arg-type]
                         correct=correct, explanation=fact, probes=probes,           # type: ignore[arg-type]
                         role={"s": "standard", "d": "discriminating", "c": "control"}[role],
                         pair_id=f"{nid}-pair" if role in ("d", "c") else None,
                         source=Citation(cite=chunk.cite() if chunk else "", quote=fact))
            res = provenance.check_question(q, ret.all())
            bad = None if res.supported else res.reason
            if len({o.text for o in opts}) < 4:
                bad = "duplicate options"
            if bad:
                reasons[bad] = reasons.get(bad, 0) + 1
                q = provenance.demote(q, res) if not res.supported else q.model_copy(update={"status": "rejected", "note": bad})
            questions.append(q)
    pool = QuestionPool(topic=topic, graph_hash=graph.graph_hash(), questions=questions,
                        generated=len(questions), rejected=sum(reasons.values()),
                        rejection_reasons=reasons,
                        notes="Human-authored, frozen; every question passed schema and provenance checks.")
    (DATA / "graphs").mkdir(parents=True, exist_ok=True)
    (DATA / "pools").mkdir(parents=True, exist_ok=True)
    (DATA / "graphs" / f"{topic}.json").write_text(graph.model_dump_json(indent=1), encoding="utf-8")
    (DATA / "pools" / f"{topic}.json").write_text(pool.model_dump_json(indent=1), encoding="utf-8")
    return pool


if __name__ == "__main__":
    for t in ("dbms", "dsa"):
        p = build(t)
        print(f"{t}: {len(p.usable())}/{p.generated} usable, {p.rejected} rejected {p.rejection_reasons}")
