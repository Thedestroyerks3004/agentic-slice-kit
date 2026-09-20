# Spec divergence — SyllabusMind

`AgentSpec-SyllabusMind-1.md` describes the plan as it stood on 15 September 2026. The build that
actually shipped in `syllabusmind/` diverged from it in three places. This is a documented pivot, not
an oversight: as ON-THE-DAY.md puts it, changing your mind because you learned something during the
build is a finding, not a failure. Here is what changed and why.

## 1. Domain: OS/Deadlocks → DBMS

The spec's worked example is one Operating Systems unit (Deadlocks, 5–6 concepts: Mutual Exclusion,
Resource Allocation, Wait-For Graph, Circular Wait, Deadlock Detection). The shipped build covers a
full Database Management Systems syllabus instead — 14 concepts across five units (relational basics,
database design, transactions, implementation, advanced topics; see `src/lib/dbmsGraph.ts`). The
diagnostic mechanics the spec cared about (competing explanations, a discriminating probe, an evidence-
gated backward transition) still apply; they were built against the syllabus actually being revised for
the hackathon rather than the illustrative OS example.

## 2. Scoring: named hypothesis weights → Beta-distribution mastery

The spec asks for explicit competing hypotheses per concept, each carrying a percentage weight updated
by fixed deltas, with a root cause *named* once one hypothesis crosses an 80% threshold (spec §3–§7).
The shipped build instead scores each topic directly as a Beta-distributed mastery value
(`src/engine/mastery.ts`), updated by confidence and question-level weights, with state derived from
that single number (`unknown → tentative → weak → shaky → solid → verified`).

This is a real reduction in scope, not a relabeling: **the shipped build does not name a specific
upstream concept as the root cause of a miss.** It tracks and reopens the topic itself, and it explains
*why* an answer was wrong (via the model-generated insights in `src/lib/insights.ts`), but it does not
run the spec's hypothesis-competition process to attribute a wrong answer to one specific prerequisite
concept over another. Anyone comparing the two documents should read this as the largest single gap
between plan and build.

## 3. The back-edge is narrower than spec'd

The spec's back-edge is general: any topic, on a wrong answer, can send the run back into hypothesis
generation and a targeted probe (spec §3, §6). The shipped back-edge is real and evidence-gated — it
only fires when the student's mastery was already ≥0.6 or the topic's state was `solid`/`verified`
(`shouldReopen`, `src/engine/mastery.ts`) — but it is **only wired up for 2 of the 14 topics**
(`TRIGGER_NODES = ['concurrency_control', 'query_optimization']`, `src/lib/dbmsGraph.ts`), each ending
its "Go deeper" session on one pre-written contrast pair (`REHEARSED`, `src/lib/backup.ts`) rather than
a live-generated probe selected from a bank of hypothesis-tagged questions. The mechanism the spec
describes exists and works; it is a fixed demo path on two topics, not a general capability the graph
produces for any topic on demand.

## 4. LLM-generated questions — an explicit, deliberate reversal

The spec bans this outright (§11: *"No LLM-generated questions — hand-authored questions with hand-
tagged misconceptions are the actual intellectual content; an LLM can't reliably invent this."*). The
shipped build's core feature is the opposite: live, schema-validated question generation per topic
(`generateDiagnostic`/`generateDeep`, `src/lib/questions.ts`), with pre-written questions demoted to a
backup path used only when generation fails or no key is configured. This was a deliberate choice made
during the build, not an oversight of the spec — the risk it introduces (a live call can fail, be slow,
or occasionally write a weak distractor) is handled by validation, retries, a circuit breaker, and the
backup set (`src/lib/llm.ts`), not by avoiding the model entirely.

## What did not change

The evidence-gated backward transition, deterministic (non-model) scoring, typed/validated model
outputs, and per-student persisted state across sessions were all spec requirements the build kept.

See `PRE-EVENT-ASSETS.md` for what was brought into the build from before the event, including the
domain/authorship mismatch between this document and `AgentSpec-SyllabusMind-1.md`.
