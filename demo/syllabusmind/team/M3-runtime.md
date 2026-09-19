# M3 Runtime: the agent loop and model access

**You get the machinery running and keep everyone unblocked.** You wire the
student session onto the spine, connect the OpenAI key, and provide the stub so
the other three can work without a key or a network. Read
[`MODULES.md`](../MODULES.md) first, then this and `docs/BUILDER.md`.

**Your files:** `session_flow.py`, `diagnoser.py`, `stub.py`, `openai_llm.py`,
`config.py`, `doctor.py`, `scripts/syllabusmind.py`, `prompts/diagnose.md`,
`tests/test_syllabusmind_session.py`.
**You do not touch:** `slice/` (if you think you must, tell Rajeev Yelkur: you have
either found a real limitation or you are about to bury logic where nobody will find
it), `engine.py`, the corpus.

---

## Why your module matters for the marks

- **35 pts, working slice:** the session loop is the demo. It must survive being
  killed and resumed, and `Store.replay` must show every step it took.
- **Tier 1 and 2 of the architecture:** durable state, typed records at every
  boundary (including the human one), bounded loops with two separate counters, and
  human-in-the-loop as a *state*.

## Order of work

### 0. First 15 minutes: environment and the OpenAI facts

`python scripts/doctor.py` (it only checks OpenRouter) and `python -m pytest` should be
green before you build anything. Then verify, in ten minutes, what design assumed:

| claim | how to check |
|---|---|
| the model id you chose exists on your key | list models with the key |
| it takes `max_tokens` or `max_completion_tokens` | one small call; read the error |
| it accepts `temperature: 0` | same call |
| JSON mode works | ask for a small JSON object and parse it |
| what a 401, 429 and quota error look like | trigger one with a bad key |

Pin the exact model id, never an alias, so a judge re-running your demo gets the
behaviour you demonstrated. The key goes in `.env` only (already git-ignored): never in
code, a commit, chat or a screenshot. Set a hard spend limit on the OpenAI project.

### 1. `config.py`, `openai_llm.py`, `doctor.py`

- `config.py`: reads `OPENAI_API_KEY`, the model ids and limits through
  `slice.config.load_env`. No other `os.environ` reads anywhere.
- `openai_llm.complete(settings, budget, messages, schema, model, step)`: **same
  signature as `slice.llm.complete`**, so any flow takes `call=` and does not care which
  provider. Call `budget.check_tokens()` before the request and `budget.record_tokens`
  after. Parse the reply into the schema with one repair pass (you cannot reuse
  `slice.llm._repair`: it hard-codes OpenRouter). Raise the spine's own errors
  (`ModelError`, `SchemaFailure`, `Truncated`, `CapExhausted`) so `runner.advance`
  handles failures without changes. Pass the spine a `Settings` built with
  `dataclasses.replace(...)` so the fences work.
- `doctor.py`: a table like the kit's: bad key (401), rate limit (429), quota, network,
  and "key works".

### 2. `stub.py` (give this to the others early)

Canned responses in the pattern of `demo/smoke/stub.py`: a generator answer, a gate
BLOCK then PASS, a diagnosis. Everyone else builds against it. Add a way to force one
BLOCK on demand.

### 3. `session_flow.py`

Use the existing `RunState` values (do not edit them): `PROBING` (code decides the next
step), `AWAITING_EXPERT` (waiting on the student), `COMPLETE`, `FAILED`. The phase
(diagnostic, verify, drilldown, proof) lives in a `session` record.

The loop in `PROBING`:

1. Read state from records (see the trap on per-item reads).
2. Call M1's `engine.next_action(...)`.
3. Act on the action: pick the question from M2's pool and `callback.ask(...)` with
   `context={"resume_state": "probing"}`, then return `AWAITING_EXPERT`; or write a
   prediction; or start a step-down; or finish.
4. On resume, the student's reply arrives through `callback.answer`. **Convert it into a
   typed `Answer` before anything reads it** (option key plus confidence). Unparsable:
   re-ask, do not guess. No reply before the timeout: `callback.sweep` records it,
   the node stays unassessed, and the report says "asked, no answer".

**Two counters, never one:**

- **Spend** (`Budget`: tokens and attempts) stops the run costing too much.
- **Revisions** (hops, reopens) are counted **from record history** and passed to the
  engine inside `SessionState`. If you point them at `budget.attempt`, two malformed
  replies silently cost a hop.

**The trap:** `Store.latest(kind)` is "the current one" only when there is one per run.
Answers and beliefs are one per item: read `history(kind)` and take the newest per key.

### 4. `diagnoser.py`

A model step: given a student's wrong answers on a node, it writes a search query,
`retrieve.search` returns passages, and it proposes a `Hypothesis` (which misconception,
with a cited quote). M2's `provenance.check` verifies the citation; a hypothesis that
fails is recorded as `could_not_establish`, never dropped. This is the bounded, cited
tool use.

### 5. `scripts/syllabusmind.py`

Copy the shape of `scripts/smoke.py`: `run --stub`, `run`, `replay <run_id>`. It must
print the same kind of line as smoke does: **"work went backwards"** when a step-down
or a gate BLOCK happened (count records in history), and warn when nothing went
backwards.

## Tests

The whole session on the stub, every state visited; **kill the process while
`AWAITING_EXPERT` and resume**; a timeout produces an unassessed node and a visible
"asked, no answer"; a garbled reply re-asks; hop and reopen limits hold after two
retried model calls; a poisoned corpus line cannot change a state or a score; adapter
errors map to the spine's error classes; no `assert` on model output inside handlers.

## Done when

- `python scripts/syllabusmind.py run --stub` runs a session with a step-down and a
  climb-back and prints the "work went backwards" line.
- `replay` shows every step and the reason for it.
- The same flow runs on the real key for one topic, with tokens well under the run
  fence.

## Risk to raise early

The session needs more phases than `RunState` has values. The plan is to keep the phase
in a record. If that gets awkward, talk to Rajeev Yelkur rather than editing `slice/`.

## Commit rhythm

Push at 11:00, 14:00, 17:00. The stub and adapter should be in the 11:00 push so
others can start; the resumable session by 14:00.
