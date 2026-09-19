# SyllabusMind: modules and owners

Four people, four modules. Each module owns its files and its tests, and promises
the others a small interface. Code against the interfaces and the stub, so nobody
waits for anybody.

Rules: `slice/` is never edited. `schema.py` changes go through M1 and are
announced in the group. Corpus and prompts are data, not code, and are reviewed by
a human before they are frozen.

| module | owner | owns | promises the others |
|---|---|---|---|
| **M1 Core** | | `schema.py`, `engine.py`, `tests/test_syllabusmind_engine.py` | the shared records; `next_action(...)` and the scoring functions |
| **M2 Content** | | `content.py`, `provenance.py`, `pool_flow.py`, `corpus/`, `data/`, `prompts/generate|blind_solve|belief_check.md`, `tests/test_syllabusmind_content.py`, `tests/test_syllabusmind_pool.py` | `load_graph`, `load_pool`, `provenance.check`, `pool_flow.build_flow` |
| **M3 Runtime** | | `session_flow.py`, `diagnoser.py`, `stub.py`, `openai_llm.py`, `config.py`, `doctor.py`, `scripts/syllabusmind.py`, `prompts/diagnose.md`, `tests/test_syllabusmind_session.py` | `session_flow.build_flow`, `openai_llm.complete`, the CLI |
| **M4 Experience and evidence** | | `report.py`, `web/`, `prompts/narrate.md`, `docs/evidence/`, `tests/test_syllabusmind_web.py` | `report.build`, the student web app, the evidence folder |

## Detailed instructions per person

- [`team/M1-core.md`](team/M1-core.md)
- [`team/M2-content.md`](team/M2-content.md)
- [`team/M3-runtime.md`](team/M3-runtime.md)
- [`team/M4-experience-evidence.md`](team/M4-experience-evidence.md)

## Order of work

Everyone starts at once against `schema.py` and the stub. Integrate at the 14:00
commit.

## Done means

A module is done when its own tests pass and the next module can call its
interface.
