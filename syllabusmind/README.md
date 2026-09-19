# SyllabusMind: DBMS MVP

A fixed 14-topic DBMS concept graph. The agent finds where a student is weak, says so plainly, and generates a fresh set of questions on whichever topic they pick.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine, graph, layout and question tests
npm run build
```

Put an API key in `.env.local` as `VITE_OPENAI_API_KEY=...` for live question generation (`sk-or-...` keys use OpenRouter, `sk-...` keys use OpenAI). Without a working key the app still runs on the pre-written backup questions.

## Flow

Intake, Score graph (all grey), Root diagnostic (two questions per topic, root outward), Score graph (coloured, the home screen), Topic panel, "Go deeper" (6 to 10 fresh questions), Outcome (ranked weak topics with a reason each).

## Scope

In: one hand-written graph (`src/lib/dbmsGraph.ts`), live question generation, the deterministic engine, the rehearsed backward loop, the outcome screen.
Out, deliberately: syllabus upload and extraction, other subjects, saved sessions by roll number, propagation to neighbouring topics, multi-model routing. The earlier full-scope version, including all of those, is kept in `archive/full-scope/` and is not built or tested. The `data/` folder holds the original syllabus files and is unused by this build.

## Questions

- Every "Go deeper" and every diagnostic topic makes one model call scoped to that topic plus its one-hop neighbours. Nothing is cached for reuse, so running a topic twice gives different questions.
- Each reply is validated. A bad reply gets one retry on another model, then the topic's pre-written backup set. After a rejected key, an empty account or repeated timeouts, live calls pause for ten minutes so nothing waits on a dead model.
- Every wrong option carries a misconception id and a plain-words belief. The report and evidence trail show "likely belief" from these.
- The level ladder (recall, application, transfer) and the contrast pair are enforced by position in code, because models mislabel them. Inside a deep-dive the next question gets harder after a right answer and easier after a wrong one.

## What stays deterministic

- Mastery is a Beta update weighted by confidence and question level. States (unknown, tentative, weak, shaky, solid, verified) and the danger overlay come from it. No model returns a score or a state.
- The backward loop: a wrong answer to the discriminating contrast question on a node that looked solid (mastery 0.6 or more) is a plain comparison against the stored key. It shows a REOPENED banner, logs an event, down-weights the node and caps it at Shaky until it passes a contrast check.
- The trigger topics, Concurrency Control and Query Optimization, always end on a pre-written contrast pair (`src/lib/backup.ts`), so that moment never depends on a network call.

## Rehearsed demo

Answer both Concurrency Control diagnostic questions correctly, press "Go deeper", answer the last question "Yes, any blocked transaction means deadlock". The same works on Query Optimization with "Yes, an index scan is always faster when an index exists". Use the same trigger when asked to make it fail.

## Layout

- `src/engine`: mastery, graph helpers, radial layout. No model imports.
- `src/lib/dbmsGraph.ts`: the fixed graph. `src/lib/backup.ts`: backup and rehearsed questions.
- `src/lib/questions.ts`: prompts, validation, shaping. `src/lib/llm.ts`: the only model adapter.
- `src/store/useApp.ts`: state and the answer pipeline. `src/theme/theme.ts`: every colour and font token.

The API key in `.env.local` is compiled into the browser bundle. Do not deploy publicly with a key that has spend on it. The key is called directly from the browser; a thin backend would keep it private but was not built.
