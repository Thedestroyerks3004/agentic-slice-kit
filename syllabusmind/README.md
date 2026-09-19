# SyllabusMind: Predict · Probe · Prove

Finds what a student is **confidently wrong** about, predicts where that will hurt next, tests its own prediction, and only marks a topic **verified** after a contrast-pair test.

## Run

```bash
pip install -r requirements.txt
python -m pytest                 # 20+ tests, no key needed
python -m syllabusmind demo      # scripted student, prints the step-down, no key needed
python -m syllabusmind serve     # http://127.0.0.1:8000
python -m syllabusmind doctor    # key, model, content checks
```

Put your key in `.env` as `OPENAI_API_KEY=...` (git-ignored). Without one the app runs in **stub mode**; with one it uses the API for the diagnoser step.

## Shape

| file | job |
|---|---|
| `engine.py`, `schema.py` | pure rules and records; the model never produces a score or a state |
| `session_flow.py` | the session on the spine: durable records, suspend/resume, two separate counters |
| `diagnoser.py` | the only model step: cited misconception, checked by `provenance.py` |
| `openai_llm.py` | API adapter: small output cap, JSON mode, one repair pass, budget checked first |
| `authoring/` → `corpus/`, `data/` | reviewed content, frozen with hashes; `build` runs the citation check on every question |
| `web/` | JSON API and one-page UI (layered map, evidence drawer, agent log, report) |
| `simulate.py` | synthetic students with planted misconceptions |

## Token use

Questions are pre-generated and frozen, scoring is code, retrieval is local. A session makes **at most one short model call per diagnosed node** (about 400 tokens in, under 100 out), and the run fence is `SLICE_MAX_TOKENS_PER_RUN`.

## Honest limits

Difficulty levels are author-labelled; 10 to 15 questions is a coarse map; the sample of predictions is tiny; the corpus is study notes written for the demo, so swap in real course material and student interview notes. Custom syllabus upload and live question generation (`pool_flow`) are not built yet.
