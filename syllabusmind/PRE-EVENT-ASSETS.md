# Pre-event assets

- The organisers' starter kit (`../slice/`, used unmodified as the spine).
- `syllabusmind/engine.py`, `schema.py`, `chunks.py`, `provenance.py`: written by the team before the event.
- Study notes in `syllabusmind/corpus/` and the question content in `syllabusmind/authoring/`: written by the team, frozen by `python -m syllabusmind build`. The notes are demo material, not interview data.
- Libraries beyond the obvious: none (pydantic, httpx, fastapi, uvicorn).
- Model access: the team's own OpenAI key, via `.env` (never committed).
