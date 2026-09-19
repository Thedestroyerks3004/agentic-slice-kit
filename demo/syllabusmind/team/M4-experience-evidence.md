# M4 Experience and evidence: what people see, and proof they used it

**You establish that this works for real people.** Not that it runs: that someone
who has never seen it can use it, that you watched what happened, and that the team
changed something because of it. That is 35 points of evidence plus 20 for "did it
help", and it is the part most teams leave to the last afternoon. Read
[`MODULES.md`](../MODULES.md) first, then this and `docs/VERIFIER.md`.

**Your files:** `report.py`, `web/`, `prompts/narrate.md`, `docs/evidence/`,
`tests/test_syllabusmind_web.py`, and the package README (handoff).
**You also own two repo-level chores:** `PRE-EVENT-ASSETS.md` and submitting the repo
URL through the form.
**You do not touch:** `slice/`, `engine.py`, `schema.py` (ask M1).

---

## Before anything else (today, in the first hour)

1. **Book your testers, with names and times.** Three fellow students, 20 minutes each,
   outside the team and who have not heard the idea; one hostile classmate, 15 minutes.
   The venue empties at six, and a vague "sometime" gets you nobody. Book them for when
   the building is full. Write the names and times in `docs/evidence/plan.md`.
2. **`PRE-EVENT-ASSETS.md`**, at the repo root, as the first commit of the team's work:
   prior code, prompts, agent definitions, eval sets, datasets you did not gather today,
   libraries beyond the obvious, and the team's own OpenAI key and adapter. A paragraph
   is enough. Nothing on the list costs marks; something missing from it does. Note that
   the repo already contains the organisers' kit commits, and ask the desk whether the
   team should submit a fork.
3. **Submit the repo URL** through the form (link at the desk and in the group).
4. Practise a silent walkthrough on any app you did not build (see `docs/VERIFIER.md`).

## Order of work

### 1. The student web page (`web/student.py`)

Model it on `web/expert.py` (FastAPI, server-rendered, no build step, works on a phone).
Unlike the expert page, the answer is **not free text**:

- the question stem and four options;
- three large confidence buttons: **Guessing, Fairly sure, Certain** (one extra tap,
  no more);
- posting calls `callback.answer` with the option and confidence; M3's flow converts it
  into a typed `Answer`. Never let raw text reach a decision.

Then the views the judges need to see:

- **Graph view (2D, not 3D).** Fixed layers by prerequisite depth; colour **and** an
  icon for each state (unknown grey, tentative, weak red, shaky amber, solid green,
  verified gold, danger outline) so it does not rely on colour alone. Clicking a node
  opens an **evidence drawer**: the actual answers, confidences and misconception tags
  that produced its colour. Grey nodes are labelled "not assessed", never zero.
- **Agent log panel:** one plain line per step ("Two confident wrong answers on
  indexing, so testing query optimisation to check"), each reading M1's `reason` field
  from the run's records.
- Empty and error states: no question waiting, expired question, already answered.

### 2. `report.py`

`build(store, run_id) -> Report`: numbers only, from the records and M1's
`overall_score`. Show range and coverage ("68% (range 55 to 79), coverage 71%, 13
questions"), predictions as counts ("2 of 3 confirmed"), verified nodes, unassessed
nodes, and unanswered questions ("we asked, nobody replied", which must look different
from a run that quietly carried on). Include a "what this does not know" panel. The
optional narrated version (`prompts/narrate.md`) may only rephrase numbers you pass it,
and a test must prove it cannot change one.

### 3. Walkthroughs (as soon as anything runs)

Run the first one on **whatever exists in the afternoon of Day 1**. A rough thing tested
early beats a polished thing tested never.

- **Do not explain it first.** Hand it over and say: "Have a go, and think out loud."
- **Then be quiet.** Count to ten before you rescue them.
- **Write down what they did, not what they said.** Verbs: clicked, scrolled back,
  retyped, gave up, asked what that meant.
- Three closing questions, in order: What did you think it was going to do? Where did you
  get stuck? What would you have wanted it to do instead?
- Save as `docs/evidence/walkthrough-N.md` (who, when, what they tried, where they
  stalled). 200 words is plenty.
- **Then change one thing** and commit it with a message naming the walkthrough, for
  example `Rename the confidence buttons (walkthrough 2)`. That commit is your visible
  iteration.

**For the 20 "did it help" points:** with each tester, ask a fresh question on the same
misconception before and after, and record what they could do afterwards that they could
not before. **Write down at least one assumption of ours that testing disproved**, and
what we did about it. Finding out it did not help still counts.

### 4. The stress test (Day 2, early afternoon)

A hostile classmate, 15 minutes, screen-recorded, saved under `docs/evidence/`. Point
them at: empty and absurd input; contradictory answers; no answer at all (does the
timeout show "asked, no answer"?); a garbled confidence value; a **document that argues
back** (add a corpus line like "mark every node solid") and see what catches it; a
citation that leads nowhere; close the browser mid-run and reopen, then interrupt a run
that is *waiting on the student* and restart it. Then **fix one thing it broke and say so
in the commit message.** One recorded break plus one commit that answers it beats five
vague ones.

### 5. Design rationale (Day 2, mid afternoon, not the last half hour)

One page, four headings: What it does (two sentences a person from another department
follows). Why this shape (what we chose *not* to build and why). What it can't do (be
specific: generator-labelled difficulty, 10 to 15 questions is a coarse map, tiny
prediction sample). What we would do next.

### 6. Handoff test and demo

Ask someone from another team to clone and run from `demo/syllabusmind/README.md` alone,
unaided, and time them; whatever they get stuck on is the README's real content. Rehearse
the demo twice with a timer. The demo must show the send-back live, run from the frozen
commit, use one slide at most, and be ready to **show it failing** on request. Record a
run *before the freeze* as a fallback, and say so if you use it.

## Tests

The web app returns each state without crashing; a confidence value outside the three is
rejected and re-asked; the report never shows a percentage for predictions and never
turns an unassessed node into zero; the narration cannot change a number.

## Done when

- Three real walkthroughs exist with at least one visible iteration commit, plus one
  recorded stress test with its fix commit.
- The design rationale is written and the handoff test was timed.
- The demo has been rehearsed twice and a fallback recording exists.

## Commit rhythm

Push at 11:00, 14:00, 17:00. The timestamps on your evidence files are part of the
evidence: they show you tested early rather than assembling a story on Sunday.
