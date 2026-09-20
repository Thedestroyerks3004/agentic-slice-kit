# SkillMind: DBMS MVP

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
Out, deliberately: syllabus upload and extraction, other subjects, propagation to neighbouring topics, multi-model routing. The earlier full-scope version, including all of those, is kept in `archive/full-scope/` and is not built or tested. The `data/` folder holds the original syllabus files and is unused by this build.

## The score graph

Mastery is the dominant signal, readable before anything is clicked. Two colour roles only: neutral grey for structure, and the red / amber / green scale for how the student is doing.

| Channel | Meaning |
|---|---|
| Fill | Flat colour by state once a topic has data: Needs work (red, x), Developing (amber, dash), Strong (green, tick), Verified (gold, star). Colour never stands alone. |
| Not checked | A flat pale grey with a quiet "?" and no outline, so it recedes and assessed topics jump forward. |
| Ring | A solid band round an assessed node. Its thickness is how much evidence backs the score: thin after one answer, thick after many consistent ones. Independent of the fill colour. |
| Size | How much of the course builds on the topic. Hubs are big and read as hubs, and their colour carries more weight. |
| Shape | Circle: a topic. Hexagon: several lines of learning meet here. |
| Badge | Right / answered, for example "3/4". |
| Tint behind the map | A soft red wash behind topics that need work, green behind strong ones, amber between, weighted by how sure the evidence is. From a distance it shows where the trouble is. |
| Links | Colour follows both ends: red and thick when both need work (a risk chain), muted red when one does, green when both are strong, amber while developing, grey until known. Solid is a hard prerequisite, dashed is helpful background. |
| Confident mistake | A red "!" flag plus a pulsing red outline and an expanding halo (a still outline if reduced motion is on). |
| Recommended topic | Marked on the map itself with a dashed accent ring and a "Start here" / "Check next" / "Work on this" tag, placed where nothing overlaps it. |

Selecting or hovering a topic gives it a glow and outline, keeps it and its direct neighbours at full strength, and fades everything two or more hops away. A link from a prerequisite that needs work is drawn in red: the likely cause. The tooltip gives unit, score, evidence and confidence in the score, prerequisites and what the topic unlocks.

Pinned in the corners: a progress donut (top left), a compact five-state legend with a "?" that explains the other channels (top right), and zoom and Fit buttons (bottom right). The map fits its container on load and on resize. Labels sit outside nodes and are placed by a collision-avoiding solver that also keeps clear of badges and the recommendation tag. Topics with no answers show no score anywhere.

Map or list view, unit filters, a progress summary, a "Recommended next" card, and a topic panel with Prerequisites, Unlocks and the likely cause of a weak result sit around the map.

## One component language

Each pattern is defined once (`src/components/ui.tsx`, `src/index.css`, tokens in `src/theme/theme.ts`) and used on every screen:

- **Primary button:** one saturated accent, the same blue as the stepper's current step. Grey and lower contrast only while it cannot be used.
- **Alert:** one component with four variants. Info (blue) is a tip, warning (amber) reports a fallback, success (green) confirms, danger (red) marks a mistake. Icon, title, optional detail and actions, optional dismiss. Raw system notices are translated for the student in `src/lib/notice.ts`: a model failure becomes "Using backup questions for this topic", never a status code or a mention of keys.
- **Choice:** one hover treatment and one selected treatment (accent border and tint). Used by answer options, the confidence control, the map/list toggle and the unit filters.
- **Segmented control:** the joined "pick one" group built on choice. Confidence is one, and defaults to "Fairly sure", so only picking an answer gates Submit.
- **Progress bar:** one height, one track, one accent fill, on the map, the quick check and the deep-dive.
- **Card:** one radius and shadow.

## The question screens

The question gets about 72% of the width and the map is a slim sidebar (or hidden behind "Hide map / View map", remembered). The sidebar map has no legend, donut or zoom, names nothing except the topic being asked, and marks it with expanding rings and a "Testing now" tag. One persistent header holds the stepper and a single "Exit to map" action; answers are saved, so leaving loses nothing. The student never sees internal detail (question level, source, fallback flags); the only caption is "Question 1 of 2". Answers can also be picked with A to D or 1 to 4, and Enter submits and moves on.

## The results page

Built so the eye knows where to look first:

- **A KPI strip** under the header: one row of four compact tiles (need work, developing, strong, confident mistakes), number large and label small, each tinted and edged in its mastery colour. The subtitle only names the weakest topic ("Weakest so far: Concurrency Control").
- **The sample size has one home**, the coverage alert: "Only 1 of 14 topics assessed (7%)", with a donut and a "Finish the quick check" action. Below three topics it says plainly that the list is a first impression, not a verdict. It disappears once everything is assessed. The count is not repeated elsewhere on the page.
- **Red to green, top to bottom:** Needs work, Developing, Strong, each a card with a mastery-coloured left edge (red once per zone, no second tinted band), mirroring the map. Within a group the order is confident mistakes, then the topics most others build on, then the lowest score.
- **Empty groups collapse** to one slim row with encouraging copy ("Strong topics will appear here as you answer more"). The unassessed topics are one collapsed row, not a list.
- **Each topic** shows its score as a donut, the evidence headline ("2 of 2 answers wrong · 1 with high confidence"), and the proof as a cited block, visually apart from the metadata above it: a labelled panel ("The question you missed") with a coloured left rule, the question in italic serif, then what the student answered and how sure they were, then the likely belief. Every ring on the page, including the coverage ring, has the same size and stroke.
- **Buttons:** the standard pair is a white outline (Evidence, Export) and solid blue (Go deeper, Finish the quick check). Navigation such as "Back to map" and "Exit to map" is a quiet link with no border.

## Saved progress

Each student's state is saved in the browser under their roll number: answers, the evidence trail, whether the diagnostic is finished, the diagnostic pair for a topic mid-way, and a deep-dive in progress. A refresh keeps you signed in on the same page. On the intake screen, typing a saved roll number offers "Continue where I left off" or "Start fresh" (which asks before erasing). "Switch student" signs out without deleting anything, and different roll numbers never see each other's data.

Saved data is checked on load: corrupt or hand-edited entries are repaired or ignored, unknown topics are dropped, and a blocked or full storage never breaks the app. It lives in `localStorage`, so it does not follow a student to another browser or device. The code is `src/lib/persist.ts`.

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
