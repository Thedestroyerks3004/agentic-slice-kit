# Tester feedback: Jeeva (3rd year CSE)

## Review

> Overall nice and agent workflow is good.

## What this tells us

The agent behaviour is what a student notices and values: questions are written live, a wrong answer
changes the plan, and progress is kept. No change was requested.

## What we did

No product change was needed. We protected and made visible the parts that earned the comment.

| Behaviour the tester saw | Where it lives | Change made after testing |
|---|---|---|
| Questions written live by a model, with a backup set if a call fails | `skillmind/src/lib/questions.ts`, `skillmind/src/lib/llm.ts` | Made live generation reliable. Hidden reasoning is switched off on OpenRouter, so a two-question call dropped from about 22 seconds to about 2. Timeouts and the circuit breaker were loosened so one slow call no longer locks the app onto backup. A retry now asks the same model again. |
| A failed contrast question reopens a topic that looked settled | `shouldReopen()` in `skillmind/src/engine/mastery.ts` | Unchanged. |
| Visible agent status while a call runs | `skillmind/src/lib/agentStatus.ts` | Retry wording made accurate ("trying it once more"). |
| Progress kept per student | `skillmind/src/lib/persist.ts` | Unchanged. |

A header badge now shows "Live questions" or "Backup questions", so it is always clear whether the model
is doing the work.

## Status

Closed. No open items.
