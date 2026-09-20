# Pre-event assets

Everything below existed, in some form, before or outside this build session, or was carried over
from an earlier iteration of it. Nothing here is claimed as work done during the judged build window.

## `syllabusmind/archive/full-scope/`

A complete prior build of this project, covering a larger original proposal: PDF/OCR syllabus upload
and parsing (`src/lib/pdf.ts`), multi-subject question banks generated ahead of time and bundled
(`src/lib/bank.ts`, `src/lib/bundles.ts`, `scripts/build-syllabi.ts`), and cross-topic mastery
propagation (`src/engine/propagation.ts`). This was superseded by the reduced-scope DBMS MVP that
shipped in `syllabusmind/src/` and is kept only for reference. See
[SPEC-DIVERGENCE.md](SPEC-DIVERGENCE.md) for why the scope was cut.

## `syllabusmind/data/*.md`

`cn.md`, `dbms.md`, `ds.md`, `os.md` — pre-existing syllabus reference material for four subjects,
gathered before the build to evaluate what a multi-subject version of the tool might cover. **Unused
by the shipped app**: the DBMS concept graph actually used (`syllabusmind/src/lib/dbmsGraph.ts`) is
hand-written directly in code, not extracted from `data/dbms.md` or any other file here.

## `AgentSpec-SyllabusMind-1.md`

Authored by a different name and team byline (Kavin K / Team Cosmos) than whoever is submitting this
code, and describing a different domain (OS/Deadlocks, not DBMS) and a different architecture (named
hypothesis weights, not the Beta-mastery scoring actually shipped). This mismatch is not incidental —
see [SPEC-DIVERGENCE.md](SPEC-DIVERGENCE.md) for the full accounting of what changed and why. Anyone
reviewing this submission should read the divergence doc before treating the AgentSpec as a current
description of the build.

## Pre-written question material

`syllabusmind/src/lib/backup.ts` (185 lines) — the pre-written backup question sets used when live
generation fails or no API key is configured, plus the `REHEARSED` contrast pairs used by the
rehearsed backward-loop trigger (`concurrency_control`, `query_optimization`) regardless of whether
generation is live or backup. Most of this (the `AUTHORED` sets and `REHEARSED`) was hand-authored
during this build, not brought in from elsewhere, but is called out here because it is static,
hand-written content sitting alongside the live-generation code path that is the project's actual
novel work — the two should not be confused when judging how much of the submission is
agent-generated versus authored in advance.

**`syllabusmind/src/lib/demoData.ts` and `syllabusmind/src/lib/demoSub.ts` (167 lines combined) are a
genuine exception to "authored during this build."** `backup.ts` imports both and its own code
comment labels them "the earlier hand-written bank" ([backup.ts:128](syllabusmind/src/lib/backup.ts#L128)),
mapped via a `LEGACY` table onto 7 of the 14 current topics (`relational_model`, `sql_fundamentals`,
`normalization`, `transactions_acid`, `concurrency_control`, `storage_indexing`, `query_optimization`).
Their question IDs and topic keys (`relmodel`, `keys`, `joins`, `norm`, `acid`, `cc`, `index`,
`qopt`) predate the current 14-topic `dbmsGraph.ts` naming and were written for an earlier version of
this project, then reused rather than rewritten. Unlike `data/*.md` below, these two files are live
and load-bearing — they are part of the shipped backup path for those 7 topics — so they are declared
here specifically as reused prior content, not as unused leftovers.

## `pdfjs-dist` dependency

Listed in `syllabusmind/package.json` but unreferenced anywhere in `syllabusmind/src/` (grepped,
zero hits) — a leftover from the archived PDF-upload feature above. See the separate commit removing
it.
