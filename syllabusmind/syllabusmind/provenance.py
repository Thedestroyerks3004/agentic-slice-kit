"""The citation check.

The model wrote the source and the quote, so neither is evidence until code has
compared them with what retrieval actually returned. Two questions, asked of no
model:

  1. Is the cited source one of the passages this search returned?
  2. Does the quote appear word for word in it, ignoring whitespace?

Both true: supported. Either false: the row is DEMOTED, kept, relabelled, with a
note saying which check failed. Never deleted: a citation that failed is a fact
about the run.

This is also most of the defence against a poisoned document. A document can
mislead a model; it cannot make a fabricated source appear in the retrieved set
or a fabricated quote appear in a passage.
"""
from __future__ import annotations

from typing import Iterable

from .chunks import Chunk, norm
from .schema import Citation, ProvenanceResult, Question

MIN_QUOTE = 12          # a 3-word "quote" proves nothing


def check(citation: Citation | None, retrieved: Iterable[Chunk]) -> ProvenanceResult:
    if citation is None or not citation.cite.strip():
        return ProvenanceResult(supported=False, reason="no source was cited")
    quote = norm(citation.quote)
    if len(quote) < MIN_QUOTE:
        return ProvenanceResult(supported=False, reason="the quote is too short to establish anything")
    chunk = next((c for c in retrieved if c.cite() == citation.cite.strip()), None)
    if chunk is None:
        return ProvenanceResult(
            supported=False,
            reason=f"cited source {citation.cite!r} was not among the passages the search returned")
    if quote not in norm(chunk.text):
        return ProvenanceResult(
            supported=False,
            reason=f"the quote does not appear word for word in {citation.cite}")
    return ProvenanceResult(supported=True)


def check_question(question: Question, retrieved: Iterable[Chunk]) -> ProvenanceResult:
    return check(question.source, retrieved)


def demote(question: Question, result: ProvenanceResult) -> Question:
    """A copy with status 'demoted' and the reason recorded. Never a deletion."""
    return question.model_copy(update={"status": "demoted", "note": result.reason})
