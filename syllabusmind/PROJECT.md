# SyllabusMind — Project Documentation

A diagnostic tool for one fixed Database Management Systems (DBMS) syllabus. A student answers questions on a
radial concept graph; the app scores their mastery of each topic deterministically (the model never scores
anything), decides on its own when a passed contrast question means a prior answer was a guess, and writes an
agent-generated explanation of the results. This document describes what the app actually does, how each piece
works, and what was explicitly scoped out.

This is the reduced-scope **DBMS MVP** build, not the original full-scope proposal (multi-subject syllabus
upload, cross-topic propagation, multi-model routing). Those were dropped; see [What is not built](#what-is-not-built).

---

## 1. What the app is, end to end

1. **Intake** — the student enters a name and roll number. Roll number is the only identity: it is the key
   progress is saved and restored under.
2. **Root diagnostic** — two questions per topic, walked outward from the graph's roots, one topic at a time.
3. **Score graph** — a radial map of all 14 topics, colour- and size-coded by mastery, always visible as the
   home screen.
4. **Go deeper** — from any topic, a fresh batch of 6–10 questions generated on demand (never cached, never
   reused). Difficulty adapts within the batch as the student answers.
5. **Rehearsed backward loop** — two topics (Concurrency Control, Query Optimization) always end their "Go
   deeper" session on a pre-written contrast question. Failing it reopens and down-weights the earlier
   diagnostic answer instead of trusting it.
6. **Results page** — topics grouped from red to green, each with the actual evidence (the real questions
   missed) and an agent-written explanation of what went wrong and why.

Everything is scoped to one hard-coded 14-topic DBMS graph. There is no subject picker, no upload, no other
syllabus.

---

## 2. The concept graph

`src/lib/dbmsGraph.ts` defines `DBMS_GRAPH`: 14 nodes across the five syllabus units, 15 directed edges
(prerequisite → dependent), hand-written, not extracted or generated from any file.

| Unit | Topics |
|---|---|
| I — Relational basics | DB Fundamentals, Relational Model & Keys, SQL Fundamentals, Advanced SQL & Triggers, Relational Algebra & Calculus |
| II — Database design | ER Model & Diagrams, Functional Dependencies, Normalization |
| III — Transactions | Transactions & ACID, Concurrency Control, Deadlock & Recovery |
| IV — Implementation | Storage & Indexing, Query Optimization |
| V — Advanced topics | Distributed DBs & NoSQL |

Edges carry a weight (used for hard-edge/checkpoint styling and importance ranking) and the first edge into a
node fixes its parent for the radial layout; later edges only add extra prerequisite links (e.g. Query
Optimization depends on both Storage & Indexing and Relational Algebra & Calculus).

`src/engine/graph.ts` provides the graph algorithms used everywhere else: `depths`, `childrenOf`/`parentsOf`,
`neighborhood` (one-hop prerequisites and dependents, used to scope question generation), `diagnosticOrder`
(breadth-first from the roots), `layoutRadial` (fixed node positions, no physics simulation), `unlocks`
(transitive dependent count), `isHardEdge`, `isCheckpoint` (≥2 parents), and `importance`.

---

## 3. Scoring engine — deterministic, not model-driven

**The model is never asked for a score, a mastery level, or a topic state.** All of that lives in
`src/engine/mastery.ts` as plain arithmetic over each topic's `NodeBelief`:

- **Belief representation**: a Beta distribution (`alpha`, `beta`) plus counters (`answers`, `correct`,
  `confidentWrong`, `verified`, `reopened`).
- **`updateBelief(belief, correct, confidence, level)`** — the only place mastery changes. Each answer is
  weighted by:
  - **confidence**: low ×0.5, medium ×1, high ×1.5 — a confident wrong answer moves the score further than a
    guess, because it signals a wrong mental model rather than a missing fact.
  - **question level**: level 1 ×0.8, level 2 ×1, level 3 ×1.3.
- **`mastery(belief)`** — the Beta mean, `alpha / (alpha + beta)`.
- **`deriveState(belief)`** — maps the belief to one of six labelled states, purely from the evidence
  collected so far: **Not checked → Partly checked → Needs work → Developing → Strong → Verified**
  (`src/lib/states.tsx` holds the labels and node-drawing code).
- **`isDanger(belief)`** — true when the student was confidently wrong and mastery is still ≤ 0.7. This is
  what the results page calls a "confident mistake."
- **`certainty(belief)`** — a Beta-standard-deviation-based measure used only for the ring-thickness visual
  (how much evidence backs the mastery number), not for scoring.
- **`shouldReopen(correct, belief)`** — a plain boolean comparison used by the backward-loop trigger (see §5).

Nothing here calls the network. A unit-test suite (`src/engine/*.test.ts`) pins this behaviour down directly.

---

## 4. Question generation

### 4.1 Root diagnostic

`generateDiagnostic` (`src/lib/questions.ts`) makes one schema-validated model call per topic, asking for
exactly two questions scoped to that topic plus its one-hop prerequisites/dependents (via `neighborhood`) for
context only — the prompt explicitly tells the model not to ask about the neighbours. The call has a 25s
timeout, one retry on a fallback model, then the topic's pre-written backup pair.

The store (`src/store/useApp.ts`) walks the diagnostic in `diagnosticOrder` (breadth-first from the graph's
roots), generating each topic's pair on demand and prefetching the next couple of topics ahead of the student
so there's rarely a visible wait.

### 4.2 "Go deeper"

`generateDeep` makes one call for 6–10 fresh questions, again scoped to the topic and its one-hop neighbours.
**Nothing is cached**: clicking "Go deeper" on the same topic twice produces two different question sets. A
40s timeout, one retry, then backup. Within the batch, `advanceDeep` in the store re-orders the *remaining*
queue after each answer — harder next on a correct answer, easier next on a wrong one — while keeping any
trailing contrast question fixed at the end.

### 4.3 Question shape and validation

`parseQuestion` enforces: exactly 4 options, all non-empty and distinct, a valid `correctIndex`, and (per
wrong option) an optional misconception id and a "belief" string describing the specific misunderstanding that
option was written to reveal. Options are shuffled in code after parsing (`shuffleOptions`) because models
tend to put the right answer first, and any misconception/belief tags travel with their option through the
shuffle. Every question also carries an author-written `explanation` (≤320 chars) of the correct reasoning,
used both as classroom-style feedback and as an input to the results-page insights (§7).

### 4.4 Backup question sets

`src/lib/backup.ts` holds:
- **`REHEARSED`** — the fixed contrast pairs for the two trigger topics (§5), used regardless of whether live
  generation is working, so the demo moment never depends on a network call.
- **Authored backup sets** for the trigger topics plus several others, and legacy pools mapped in for the
  rest, all reachable through `backupDiagnostic(nodeId)` / `backupDeep(nodeId)`.
- Backup is **insurance, not the product**: it is only used after two failed live attempts, or when no API key
  is configured at all.

---

## 5. The rehearsed backward-loop trigger

For `TRIGGER_NODES = ['concurrency_control', 'query_optimization']`, the "Go deeper" session always ends on a
fixed contrast pair (`REHEARSED`), inserted by `finalizeDeep` regardless of what the live model returned:

- **Control question** — the misconception happens to produce the *correct* answer, so passing it proves
  nothing about whether the student actually holds the misconception.
- **Discriminating question** — the same misconception, on a scenario where it produces the *wrong* answer.

Whether the discriminating question was answered correctly is decided by a plain comparison against the
stored answer key (`shouldReopen`) — never by the model. In `useApp.answer()`:

- **Fail the discriminating question** → the topic is `reopened`: its belief is down-weighted
  (`beta + 1.5`), `verified` is cleared, and a log entry records the reason, including whether the earlier
  control question was passed (a signature of guessing rather than of holding the concept).
- **Pass it, with mastery > 0.7 and ≥2 answers** → the topic is marked `verified`, a positive log entry is
  recorded.
- A visible banner (`Banner`, rendered via the shared `Alert` component) announces either outcome immediately.

This is the one place the app treats a later answer as evidence that an earlier answer should be trusted less
— and it is entirely rule-based, not model-judged.

---

## 6. State, persistence and navigation

- **State**: a single Zustand store (`src/store/useApp.ts`) holds the student, all 14 `NodeBelief`s, the full
  answer/reopen/verify log, the current diagnostic/deep-dive question queues, and UI signals (banner, busy,
  notice).
- **Persistence**: `src/lib/persist.ts` saves the full state to `localStorage` keyed by roll number
  (`sm.session.<roll>`), plus `sm.lastRoll` so a page refresh resumes the last student automatically. Signing
  out (`signOut`) clears the in-memory session but leaves the saved data, so the same roll number can be
  resumed later; starting fresh with the same roll number explicitly wipes it.
- **Navigation**: `src/App.tsx` is a small hash router (`intake` / `graph` / `diagnostic` / `deepdive` /
  `report`) with guards that redirect to `intake` or `graph` if the required data (a student, a deep-dive
  queue) doesn't exist — so a stale or manually-edited URL can't render a broken screen.

---

## 7. Agent-generated insights on the results page

The results page (`src/screens/Report.tsx`) groups topics into **Needs work / Developing / Strong / Partly
checked / Not assessed** (`buildReport` in `src/lib/report.ts`), ordered within each group by confident
mistakes first, then by how many other topics build on it, then by lowest mastery.

On top of that grouping, `src/lib/insights.ts` adds an agent-written layer, built strictly from the student's
own answer log — never from invented facts:

- **`buildFacts`** — pulls, for every topic in Needs-work/Developing that has at least one wrong answer, the
  topic's state/mastery/danger flag, how many topics it blocks, its prerequisites, and its most recent (up to
  three) wrong answers — each with the question text, the option chosen, the correct answer, how confident the
  student was, and the "belief" that wrong option was written to reveal.
- **Deterministic fallback (`fallbackInsights`)** — renders instantly from those facts alone, so the page is
  never empty and never waits on a network call to be useful:
  - a **page-level takeaway**, stating how many topics it's based on and adding a caution when the sample is
    small;
  - a **shared-thread line** per topic, only when two or more misses point to the same underlying belief;
  - a **confidence-pattern line**, only when two or more misses share the same confidence level and at least
    one was confident — read as a sign the student isn't noticing their own mistakes — versus a one-off when
    confidence varied;
  - a **confident-mistake callout**, only for topics flagged `danger`;
  - a **"Start here" line** for the first Needs-work topic, naming what it blocks and any shared gap;
  - a **once-per-page score-movement note**, shown only when a confident miss exists, explaining that a
    confident wrong answer moves the score more than a guess because it signals a misunderstanding rather than
    a missing fact.
  - **Important limit**: the fallback deliberately writes **no "why this is wrong" text**. Earlier it filled
    that line with a template like `"Timestamps" is not the right answer here.` — that was found to be a
    non-explanation and was removed outright rather than kept as a fallback.
- **Model call (`generateInsights`)** — one batched call per page load (task `rootcause`, 40s timeout), given
  only the facts above, asked to write the "why this is wrong" line for each miss (what the chosen option
  actually means, what correct concept it's confused with, the precise distinction — 1–2 plain sentences, no
  jargon beyond the question itself) plus the takeaway/thread/confidence/start lines in the same voice.
  `validateInsights` then:
  - drops any topic id the model invents that isn't in the facts;
  - only accepts a thread/confidence/start line where the underlying facts actually support one (e.g. a start
    line is only kept for the first topic, a thread only where ≥2 misses exist);
  - **rejects a "why" line that merely restates the option as wrong** (`isRealExplanation`, a length + phrase
    check), so a bad model reply cannot silently reintroduce the templated non-answer;
  - `mergeInsights` layers whatever the model produced over the deterministic fallback, field by field, so a
    partial or failed reply degrades gracefully rather than blanking the page.
- **On the page**: while a model call is in flight the "why" line for a miss is left blank rather than shown
  as a placeholder; once it settles, an unexplained miss reads **"Why this is wrong: Explanation unavailable"**
  instead of any invented or templated text. Results are cached per exact state of the answers
  (`factsSignature`/`insightCache`) so returning to the page doesn't repeat the call.
- Evidence rows visually separate a wrong-and-confident answer (red-tinted card, ⚑ flag, "Confident mistake ·
  {level} confidence" label, a one-line "worth a closer look, not just review" note) from a wrong-and-guessing
  answer (plain grey "Incorrect" card, no commentary) — from `evidenceFor`/`EvidenceList` in
  `src/components/ui.tsx`.

---

## 8. The model adapter (`src/lib/llm.ts`)

The single chokepoint for every network call to a model, used only for question generation and results-page
insights — **never for scoring**.

- **Providers**: auto-detects OpenAI vs. OpenRouter from the key prefix (`sk-or-` = OpenRouter); both use the
  same OpenAI-compatible chat-completions request shape.
- **Key source**: `VITE_OPENAI_API_KEY` baked in from `.env.local` takes priority; otherwise a key entered in
  Settings (`localStorage`).
- **Tasks**: `extract | question | crosscheck | propagate | rootcause`, each with its own default model.
  Default OpenRouter models are free-tier (`nvidia/nemotron-3-super-120b-a12b:free`, a large reasoning model
  that is slow and occasionally returns malformed output; retry model `deepseek/deepseek-v4-flash-0731:free`).
- **Robustness**: `tolerantParse` (`src/lib/json.ts`) recovers JSON from a reply that isn't perfectly
  formatted; every call site supplies its own `validate` (schema check) and `fallback`; a per-attempt
  `timeoutMs` keeps interactive calls from hanging the UI.
- **Circuit breaker**: after a 401/402/403 (bad key / no credit / forbidden), or two consecutive timeouts, live
  calls are paused for 10 minutes and every request goes straight to backup — so a dead key doesn't make every
  question wait through a doomed retry first.

**Caveat**: live model generation is implemented and exercised by the app's error paths, but has not been
verified against a real, funded key in this environment — both keys supplied during development had no usable
credit. Everything shown working end-to-end (diagnostics, "Go deeper", the rehearsed trigger, the insights
page) has been verified with the backup/fallback path and the automated test suite; the live-network path is
the same code but has not been observed succeeding against a paid response.

---

## 9. UI and visual language

Single shared component vocabulary across every screen (`src/components/ui.tsx`):

- **`NavBar`** — a stepper (Intake / Score graph / Quick check / Outcome) plus a single "← Exit to map" ghost
  button while a quiz is in progress.
- **`Alert`** (info/warning/success/danger, optional icon, dismissible) — the one component used for every
  banner, notice and callout on the site, so status messages always look and behave the same way.
- **`Donut`**, **`ProgressBar`**, **`Segmented`**, **`.choice`** (option button styling, selected state via
  ARIA), **`.btn-primary`**/**`.btn-ghost`** — shared primitives reused everywhere rather than one-off styles.
- **`ScoreGraph`** (`src/components/ScoreGraph.tsx`, canvas via `react-force-graph-2d`, no physics — fixed
  radial positions from `layoutRadial`): mastery is the dominant visual signal — node fill colour and size,
  an evidence ring whose thickness reflects how much data backs the number, a temperature wash across the
  canvas, a pulse animation on confident mistakes, coloured/hex-styled edges for hard prerequisites and
  checkpoints, a collision-aware label placement solver, fit/zoom controls, and a compact legend.
- **Theming**: Tailwind v4 with CSS custom-property tokens (`src/theme/theme.ts`, `@theme inline` in
  `src/index.css`) — a light theme throughout, one set of mastery-state colours reused for every visual
  encoding (node fill, section left-borders, chip colours, evidence-row tinting) so red/green/amber always
  mean the same thing everywhere on the page.

---

## 10. Testing and verification

- **Automated tests**: `vitest`, 9 files / 115 tests as of this writing, covering the mastery engine, question
  parsing, persistence, recommendation ordering, edge-tone styling, notice text, report grouping/evidence, and
  the insights module (facts extraction, deterministic fallback text, prompt construction, and validation of
  model replies including rejection of a restating "why" line). `archive/**` (the old full-scope build) is
  excluded from the test run.
- **Type checking**: `tsc --noEmit` is run after every change described above; the codebase currently
  type-checks cleanly.
- **Build**: `vite build` succeeds.
- **Manual/browser verification**: done via a headless-browser script (puppeteer-core + Edge) with the API key
  overridden empty, so the app is exercised entirely on its backup-question and deterministic-fallback paths.
  This is the only path that has actually been observed working end-to-end in this environment; see the
  caveat in §8.

---

## 11. What is not built

Explicitly out of scope for this MVP (present in the original full-scope proposal, removed on realignment):

- **Syllabus upload / extraction** — no file upload, no parsing of arbitrary syllabus text into a graph. The
  DBMS graph is fixed and hand-written (§2). The `data/` folder contains unrelated syllabus `.md` files from
  earlier exploration; they are unused by the running app.
- **Multi-domain / multi-subject support** — only DBMS exists. No subject picker, no per-subject graphs.
- **Score/mastery propagation across topics** — a topic's mastery is derived only from direct answers on that
  topic; there is no "weak prerequisite implies weaker dependent" propagation logic. (`unlocks`/`dependentCount`
  are used only for *ordering* and *messaging* — e.g. "blocks 2 other topics" — never to change a mastery
  number.)
- **Multi-model routing beyond OpenAI/OpenRouter** — the adapter supports exactly those two provider shapes,
  chosen by key prefix; no routing across arbitrary providers.
- **Verified live generation on a funded key** — the live-model code path exists and is exercised by its own
  failure/retry/circuit-breaker logic, but has not been confirmed working end-to-end against a real paid
  response in this environment (§8).
- **Server-side/shared persistence** — progress is `localStorage`-only, per browser, keyed by roll number;
  there is no backend, account system, or cross-device sync.
- **Bundled question banks for the other syllabi in `data/`** — never generated; would require a funded key
  and is outside this MVP's scope regardless.
