# SyllabusMind: the idea and the approach

*Predict · Probe · Prove.* An adaptive diagnosis agent that finds what a student is
**confidently wrong** about, **predicts** where that will hurt next, **tests its own
prediction**, and only calls a repair **verified** after a contrast test.

Team Cosmos · CEG ASTRA Agent-a-thon · 19–20 September 2026

---

## 1. The problem

A student preparing for exams or interviews (DBMS, DSA) studies alone and gets a score
back: "you scored 60% in Indexing". Nothing tells them:

- which **prerequisite idea** is actually broken (query optimisation fails because
  indexing is shaky, not because of anything in query optimisation);
- which answers were **confident mistakes**, the most dangerous kind, because the
  student sees no reason to revise them.

So they re-read whole chapters or grind generic practice sets.

## 2. The idea in one paragraph

Turn a syllabus into a small prerequisite graph. Diagnose the student with questions
whose wrong options are each tagged with a named misconception, and ask how sure they
were. From the pattern, **write down predictions** about topics not yet tested, test
them, and report the hit count. Drill the weakest or most confidently wrong topic; when
they keep missing, **step down** to the prerequisite that is really broken, and climb
back. Finally, do not call a topic fixed until the student passes a **contrast pair**: one
question where the misconception gives a wrong answer, and a control where it happens to
give the right one. Passing only the control looks like a guess.

## 3. Why this is an agent and not a pipeline

An agent is a workflow that can go backwards. The route through this system depends on
what the run finds:

| what sends work backwards | who decides |
|---|---|
| *(planned, not built yet)* a generated question fails a **gate** (citation, blind-solve, belief check) and goes back to be regenerated, at most 3 times | code, from a model's verdict |
| two misses on a topic send the run **down** to a prerequisite, and a pass sends it back **up** (hop limit 2) | the engine, from the answers |
| a proof that does not pass **reopens** the drilldown once | the engine |

It also has state that survives the process (an append-only store, resumable after a
kill), a human as a *state* the run suspends into (the student answering), tool use
(retrieval over a corpus to support a diagnosis), and two separate bounds (a spend limit
and a revision limit that never share a counter).

**Orchestration is code, judgement is the model.** Models can propose a cited
diagnosis and rephrase the final numbers (and, once the gate is built, write and check questions). Every score, every node
state and every next step is deterministic Python.

## 4. Who does the thinking

| step | agent | human |
|---|---|---|
| propose questions, check them, retrieve passages | yes | |
| approve the prerequisite graph and the question pools | | yes (a wrong edge poisons everything) |
| choose the next question, level and step-down | yes (rules) | |
| answer, and say how sure | | yes: this is the evidence |
| pick which topic to drill (or accept the suggestion) | | yes |
| flag a bad question | | yes |

The agent never decides whether the student is "good", and never marks a topic fixed
without the proof.

## 5. How a session runs

```
refresh (returning student)  ->  diagnostic  ->  predict  ->  verify  ->  drilldown  ->  proof  ->  report
                                                                              |  ^          |
                                                          step down <---------+  +--- climb back
                                                          (reopen once if the proof fails) <-+
```

1. **Diagnostic**: coverage first (the unassessed topic with most dependents), difficulty
   chosen from a running ability estimate, at most 3 follow-ups to tell a slip from a gap.
2. **Predict**: rank untested dependents of Danger/Weak topics and write the top 2–3 to the
   record *before* testing them. Entries are never edited.
3. **Verify**: 1–2 questions per predicted topic; each prediction becomes confirmed or
   refuted, and the edge weight is reweighted from the outcome.
4. **Drilldown**: difficulty ladder on the chosen topic; wrong once means a different angle,
   wrong twice means step down; a passed prerequisite climbs back.
5. **Proof**: contrast pair on the diagnosed misconception. Both right: verified. Control
   only: not repaired. Discriminating only: improving.
6. **Report**: numbers only, with a range, coverage and a "what this does not know" panel.
7. **Second encounter**: a returning student gets a refresher on each previously verified
   topic ("still holds" or "regressed") and the reweighted edges are carried over.

## 6. What the engine computes

- **Belief per topic** (evidence-weighted Beta): answer weights L1 0.6 / L2 1.0 / L3 1.4; a
  correct answer tagged "guessing" counts half. `mastery = a/(a+b)` with a 90% range.
- **States**: unknown (never treated as zero) · tentative (1 answer) · weak (<0.40) ·
  shaky · solid (>0.70, 2+ answers) · verified (passed the contrast pair). **Danger** is an
  overlay: a wrong answer at "certain", or two wrong at "fairly sure".
- **Overall score**: dependent-weighted over *assessed* topics only, reported as
  `68% (range 55–79) · coverage 71%`. Predictions are reported as counts, not percentages.
- **Calibration**: topics where confident answers were wrong at least half the time.

## 7. How it is built on the kit

| kit principle | where it lives |
|---|---|
| durable state outside the conversation | `slice/store.py` append-only history; every step is a record |
| typed contracts at every boundary | `syllabusmind/schema.py`; the student's click or text becomes an `Answer` before it can matter |
| bounded loops, two bounds | spend: `Budget`. Revisions and hops: counted from record history |
| provenance | every question carries a source and a verbatim quote; `provenance.check` compares them with what retrieval returned; failures are **demoted, never deleted** |
| human-in-the-loop as a state | `callback.ask` suspends the run; `answer` resumes it; timeouts are recorded as "asked, no answer" |
| orchestration in code | `engine.next_action`; the model is never asked which step comes next |
| adversarial test | a poisoned corpus line must not change any score or verdict; a fabricated citation must be rejected |
| failure behaviour per dependency | model outage, bad key, empty corpus and no-answer each have a recorded outcome |

`slice/` is the organisers' spine and is not edited. The project ships with its own copy
so it runs from this folder alone.

## 8. Layout

```
syllabusmind/                     project root (own copy of the spine, env and tests)
  slice/                          the spine, unchanged
  syllabusmind/                   the domain package
    schema.py  engine.py          the shared records and the pure rules
    chunks.py  provenance.py      retrieval and the citation check
    session_flow.py  memory.py    the student session on the spine; second-encounter memory
    diagnoser.py  simulate.py     cited misconception hypothesis; simulated students
    openai_llm.py  config.py      model access with your OpenAI key (doctor.py checks it)
    stub.py  report.py  web/      canned model replies; numbers-only report; student web app
    authoring/                    builds the frozen graphs and pools from the corpus
    corpus/  data/                DBMS and DSA sources, graphs and frozen pools
  tests/  docs/                   tests, and evidence for the walkthroughs
```

## 9. How it is judged, and what shows it

| weight | what the judges look for | what we show |
|---|---|---|
| 35 | it runs, and one step judges another's work and sends it back | a step-down and climb-back, a reopened proof, both visible in `replay` (the question gate is still to build) |
| 35 | real people outside the team used it, and what changed | three walkthroughs and one recorded stress test, each with a commit that answers it |
| 20 | what the person could do afterwards; what we did when an assumption was wrong | before and after on one misconception per tester; at least one refuted assumption written down |
| 10 | commit rhythm, the demo, how questions are handled | pushes at 11:00, 14:00 and 17:00; one slide; showing it fail on request |

## 10. Honest limits

- Difficulty levels are labelled by whoever wrote the question; they are not calibrated on
  real students.
- 10 to 15 questions give a coarse map, not a measurement of mastery. That is why unknown
  topics stay grey and the score carries a range and a coverage figure.
- Prediction hit rates are counts on a very small sample.
- Prerequisite edges are hypotheses that a human approves.
- The bundled questions and the "student notes" corpus were drafted as a starting point;
  a person must read every question and replace the notes with real student interviews
  before the demo.
- Scope is two frozen topics (DBMS and DSA). Live syllabus upload is a later front end,
  not part of this build.

## 11. Status

Committed (859df6d): shared records, retrieval, the pure engine, citation check, session
flow with memory, diagnoser, model adapter, report, web app, frozen DBMS and DSA content,
and tests. **Not built:** the live question-generation gate (generate, blind-solve, belief
check, send back on BLOCK) and its prompts. Until it exists, the send-back the judges see
is the step-down / climb-back / reopen loop, and the question pools are frozen ones built
from the corpus with quotes checked by `provenance.check`. Run the tests before relying on
any claim here.
