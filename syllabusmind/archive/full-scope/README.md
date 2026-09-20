# SkillMind

Pick a syllabus, get a concept graph, take an adaptive diagnostic, and see which topics are weak or solid and why.

```bash
npm install
npm run dev              # http://localhost:5173
npm test                 # engine, bank and layout unit tests
npm run build
npm run build:syllabi    # turn files in data/ into graphs + question banks
```

## Adding syllabi

1. Put a `.md`, `.txt` or `.pdf` file in `data/` (one per course). An optional first line `# Course title` sets the title.
2. Put your key in `.env.local` as `VITE_OPENAI_API_KEY=...` (`sk-or-...` keys use OpenRouter, `sk-...` keys use OpenAI).
3. Run `npm run build:syllabi`. For each file it writes `src/generated/<name>.json` holding:
   - the concept graph: topics grouped by unit, prerequisite links, and three sub-topics per topic;
   - the full question bank: per topic a level 1 recall, a level 2 application, a level 3 transfer question and a contrast pair, plus two questions per sub-topic. Every wrong option carries a misconception id.
4. The app lists these on the first screen and loads them with no model calls at runtime.

Options: `-- --force` rebuilds, `-- os` builds only `data/os.*`, `-- --crosscheck` has a second model verify every answer key.
Progress is cached in `data/.cache`, so a failed run resumes instead of repeating finished calls.
Practicals, suggested activities, evaluation methods and reference lists are stripped before the model sees the text.

Free OpenRouter models are limited to 50 requests a day and spend many tokens on hidden reasoning, so the script uses large token budgets and about ten calls per syllabus. With a paid key (for example `SM_MODEL=openai/gpt-4o-mini`) quality is noticeably better: `SM_MODEL=... npm run build:syllabi -- --force`.

A syllabus uploaded in the app instead of `data/` is processed at runtime: the graph is extracted, and after you approve it the whole question bank is generated in one pass of a few parallel batched calls.

## Flow

Intake, Review (edit and freeze the graph), Adaptive diagnostic, Score graph (home), Topic deep-dive, Report.
Sessions are saved in `localStorage` by roll number plus syllabus, so a returning roll number loads its graph.

- **Adaptive diagnostic:** each topic starts at level 2. A right answer steps up to level 3, a wrong one down to level 1. A topic settles after two answers, or after one confident answer, so most topics need one or two questions.
- **Drill-down:** "Go deeper" opens a topic's sub-topics as a branch of the graph. The quiz and the report for that topic use only its own subtree.
- **Dynamic difficulty:** inside a deep-dive the next question gets harder after a right answer and easier after a wrong one, with the contrast pair always last.

## Structure

- `src/engine`: deterministic Beta mastery, state derivation, propagation clip, layouts. No model imports.
- `src/lib/bank.ts`: prompts and validators shared by the app and the build script.
- `src/lib/llm.ts`: the only model adapter (JSON only, one retry on another model, then a fallback).
- `src/lib/content.ts`: runtime graph extraction, batch bank generation, sub-topics.
- `src/store/useApp.ts`: state, persistence, the answer pipeline, the reopen rule.
- `src/theme/theme.ts`: every colour, radius and font token. Edit this one file to re-tint the app.
- `scripts/build-syllabi.ts`: the generator behind `npm run build:syllabi`.

## Guardrails that stay in code

- Evidence is weighted by confidence and question level. Nothing a model returns is a score or a state.
- Propagation is a bounded nudge held apart from direct evidence. It moves Unknown to Tentative at most and never leaves a node's own evidence band.
- Reopen: a failed contrast question on a node that looked solid is a plain comparison against the stored answer key. It shows a banner, logs an event, down-weights the node and caps it at Shaky until it passes a contrast check.
- Model judgment of propagation to neighbours is off by default (one call per answer). The local edge-weight rule is used. Turn it on in Settings.

The API key set in `.env.local` is compiled into the browser bundle. Do not deploy publicly with a key that has spend on it.
