"""Corpus passages and how to find them.

`Chunk` mirrors slice.retrieve.Chunk (doc, ordinal, text, cite()) so anything
written against one works with the other. The default retriever is a plain
keyword ranker over the same paragraph splitter the spine uses: no embeddings,
no extra downloads, deterministic, and enough for a corpus of a few dozen pages.
`SliceRetriever` wraps the spine's vector search when sqlite-vec and fastembed
are installed (they are in the Codespaces image).

Retrieved text is DATA, never instructions. Nothing here interprets it.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

_WORD = re.compile(r"[a-z0-9]+")
_STOP = frozenset("a an and are as at be by for from has have in is it of on or that the "
                  "this to was were what when which with you your not no do does".split())


@dataclass(frozen=True)
class Chunk:
    doc: str
    ordinal: int
    text: str
    distance: float = 0.0

    def cite(self) -> str:
        return f"{self.doc}#{self.ordinal}"


class Retriever(Protocol):
    def search(self, query: str, k: int = 4) -> list[Chunk]: ...


def split(text: str, target: int = 900, overlap: int = 0) -> list[str]:
    """Paragraph-boundary splitter (same idea as slice.retrieve.split, no overlap
    so a quote can never straddle two chunks)."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    out, buf = [], ""
    for p in paras:
        if buf and len(buf) + len(p) > target:
            out.append(buf)
            buf = p
        else:
            buf = f"{buf}\n\n{p}" if buf else p
    if buf:
        out.append(buf)
    return out


def _tokens(s: str) -> list[str]:
    return [w for w in _WORD.findall(s.lower()) if w not in _STOP and len(w) > 1]


class KeywordRetriever:
    """Rank chunks by weighted keyword overlap. Empty corpus returns []."""

    def __init__(self, folder: str | Path):
        self.folder = Path(folder)
        self.chunks: list[Chunk] = []
        for f in sorted({*self.folder.rglob("*.md"), *self.folder.rglob("*.txt")}):
            if f.name.lower() == "readme.md":
                continue
            for i, c in enumerate(split(f.read_text(encoding="utf-8", errors="replace"))):
                self.chunks.append(Chunk(doc=f.name, ordinal=i, text=c))
        self._tok = [set(_tokens(c.text)) for c in self.chunks]

    def search(self, query: str, k: int = 4) -> list[Chunk]:
        q = set(_tokens(query))
        if not q or not self.chunks:
            return []
        scored = []
        for c, toks in zip(self.chunks, self._tok):
            hit = len(q & toks)
            if hit:
                scored.append((hit / (len(q) ** 0.5 * len(toks) ** 0.25), c))
        scored.sort(key=lambda t: -t[0])
        return [Chunk(c.doc, c.ordinal, c.text, distance=1.0 - min(s, 1.0))
                for s, c in scored[:k]]

    def all(self) -> list[Chunk]:
        return list(self.chunks)


class SliceRetriever:
    """Vector search through the spine. Imported lazily: needs sqlite-vec and
    fastembed, which the plain-Python environment may not have."""

    def __init__(self, store, folder: str | Path):
        from slice import retrieve                      # noqa: WPS433 (lazy on purpose)
        self._r, self.store = retrieve, store
        retrieve.ingest(store, folder)

    def search(self, query: str, k: int = 4) -> list[Chunk]:
        return [Chunk(c.doc, c.ordinal, c.text, c.distance)
                for c in self._r.search(self.store, query, k=k)]


def norm(s: str) -> str:
    """Whitespace-normalised, for verbatim comparison."""
    return re.sub(r"\s+", " ", s or "").strip()


def make_retriever(folder: str | Path, store=None, prefer_vector: bool = False) -> Retriever:
    if prefer_vector and store is not None:
        try:
            return SliceRetriever(store, folder)
        except Exception:                                  # missing extension, no model
            pass
    return KeywordRetriever(folder)
