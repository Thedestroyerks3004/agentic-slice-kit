"""The one model step in a session: name the misconception behind a student's
wrong answers on a node, citing the corpus.

Token-lean by design: the retrieval query is built in code (no query-writing
call), at most 3 short passages go in, and the reply is a tiny record. The model
writes the citation, so it is not evidence until provenance.check has compared it
with the passages this search returned; a failure is recorded as
`could_not_establish` with the reason, never dropped."""
from __future__ import annotations

from pydantic import BaseModel

from . import provenance
from .schema import Citation, Hypothesis, HypothesisDraft

SYSTEM = ("You diagnose a student's misconception. Use ONLY the passages given. "
          "Reply JSON: statement (one sentence), cite (a passage id exactly as shown), "
          "quote (a verbatim excerpt of at most 25 words from that passage).")


def diagnose(ctx, call, retriever, graph, node_id: str, answers) -> Hypothesis:
    node = graph.node(node_id)
    wrong = [a for a in answers if a.node_id == node_id and not a.correct]
    beliefs = [graph.belief_text(a.misconception_id) for a in wrong if a.misconception_id]
    beliefs = list(dict.fromkeys(b for b in beliefs if b))
    top = max(set(a.misconception_id for a in wrong if a.misconception_id) or {None},
              key=lambda m: sum(a.misconception_id == m for a in wrong), default=None)
    query = f"{node.name} {' '.join(beliefs)}"
    chunks = retriever.search(query, k=3)
    if not chunks:
        return Hypothesis(node_id=node_id, misconception_id=top, statement="",
                          status="could_not_establish", note="the search returned no passages")
    passages = "\n".join(f"[{c.cite()}] {c.text[:350]}" for c in chunks)
    user = (f"Topic: {node.name}\nStudent held: {'; '.join(beliefs) or 'unclear'}\n"
            f"Passages:\n{passages}")
    draft = call(settings=ctx.settings, budget=ctx.budget, step="diagnose", schema=HypothesisDraft,
                 messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}])
    res = provenance.check(Citation(cite=draft.cite, quote=draft.quote), chunks)
    return Hypothesis(node_id=node_id, misconception_id=draft.misconception_id or top,
                      statement=draft.statement, citation=Citation(cite=draft.cite, quote=draft.quote),
                      status="supported" if res.supported else "could_not_establish", note=res.reason)
