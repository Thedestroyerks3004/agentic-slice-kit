# Architecture divergence — SyllabusMind

This kit's `slice/` (`runner.py`, `llm.py`, `callback.py`, `budget.py`, `store.py`, `retrieve.py`,
`records.py`) is the provided Python spine, meant to be kept while `demo/` is swapped for the team's
own problem. The team evaluated it and chose not to build on it. This is a documented decision, not an
oversight — the kit itself says as much: `docs/PREP for AGENT-A-THON.md` calls the kit "optional, and
free to ignore. It's a working agent with the awkward parts already solved, so your two days go on
your problem instead of on plumbing." The rubric (`docs/PRINCIPLES-BRIEF.md`) scores agentic
principles directly — state persistence, a back-edge, bounded loops, typed contracts, human-in-the-loop
handling — not whether `slice/` specifically was used.

## Why not `slice/`

SyllabusMind's actual interface is a radial concept-graph diagnostic with live, per-topic canvas
rendering, drag/zoom, animated mastery state, and a multi-screen quiz flow — a client-heavy interactive
frontend. `slice/`'s spine is a Python state machine built around a request/response run loop
(`runner.py`), suited to a server-mediated agent session, not to driving an interactive canvas UI
directly. Porting a tested, working application onto a different language's state machine with limited
time left was pure downside for zero required benefit — the two-day clock the kit itself is built
around had already been spent building and hardening the actual application.

## What was built instead, and where the same principles live

A self-contained React + Zustand + TypeScript single-page app (`syllabusmind/`), independently
implementing the same underlying principles the kit's spine exists to provide:

| Principle | Where it lives |
|---|---|
| State persistence outside the conversation | `syllabusmind/src/store/useApp.ts` (Zustand store, subscribed to `localStorage` via `syllabusmind/src/lib/persist.ts`), keyed per student and restored on load — not held in any model conversation. |
| A genuine back-edge (evidence-gated, not always-fires) | `shouldReopen()` in `syllabusmind/src/engine/mastery.ts`, wired into the reopen branch of `answer()` in `useApp.ts` — a failed contrast question sends an already-"solid" topic's result backwards for down-weighting, driven by the student's actual answer, not a fixed script. |
| Two independent bounded-loop counters | A network-spend counter (`timeouts`, `syllabusmind/src/lib/llm.ts`, driving a circuit breaker) and a revision counter (`reopenCount` / `MAX_REOPENS`, `syllabusmind/src/engine/mastery.ts` and `useApp.ts`) — deliberately kept as separate state so a flaky network retry and a topic revision never share a budget. |
| Typed contracts at every model-call boundary | Every call to a model goes through `generateJSON<T>` in `llm.ts`, which requires a caller-supplied validator and a typed fallback — no raw model string ever reaches the UI or the scoring engine. |
| Human-in-the-loop / defined failure behavior | The scoring engine (`mastery.ts`) never calls a model at all — mastery, state, and the reopen decision are plain, auditable arithmetic and comparisons over the student's own answers; every network failure mode (bad key, timeout, rate limit, malformed reply) has defined, non-silent behavior in `llm.ts`. |

This table summarizes an audit already carried out against the running application; it is not argued
again here.

## What was removed, and why

`demo/syllabusmind/` (module scaffolding — `engine.py`, `diagnoser.py`, `report.py`,
`session_flow.py`, `team/M1-core.md` through `M4-experience-evidence.md`, and matching prompt files)
and its five paired `tests/test_syllabusmind_*.py` files have been deleted. Every one of them
contained nothing but a single-line docstring ("Structure only for now.") — an unstarted scaffold from
an earlier plan this architecture superseded. Left in place, an empty scaffold with the team's own
name on it reads as an abandoned start, which is worse than no scaffold at all; removed and explained
here, it reads as what it was: a plan that changed once the team learned what the problem actually
needed.

`demo/syllabusmind/` was removed because it was an unstarted scaffold from an earlier plan that this
architecture superseded; `slice/` remains in the repo as provided but is not used by the running app.
