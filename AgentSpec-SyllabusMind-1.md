# AgentSpec — SyllabusMind (MICRO-Lite)

> **How this diverged from the spec.** The build that shipped differs from this document in domain
> (DBMS, not OS/Deadlocks), in scoring (Beta-distribution mastery per topic, not named hypothesis
> weights with an 80% threshold — the shipped build does not name a specific upstream concept as a
> root cause), in back-edge scope (evidence-gated but wired to 2 of 14 topics via a fixed rehearsed
> pair, not a general mechanism), and most deliberately in §11's ban on LLM-generated questions, which
> became the shipped build's core feature instead. Full detail in [SPEC-DIVERGENCE.md](SPEC-DIVERGENCE.md).
> This is a documented pivot: changing your mind because you learned something during the build is a
> finding, not a failure.

*Minimum-Concept, Syllabus-Grounded Root-Cause Diagnosis — Two-Day Build*

CEG ASTRA Agent-a-thon — September 2026

Submitted by: Kavin K
Team: Cosmos
Department: Information Science and Technology
Submitted: 15 September 2026

---

## 1. The Setting — REQUIRED, JUDGED

A student revising **Operating Systems — Deadlocks** for an upcoming exam or interview keeps missing deadlock-detection questions, gets told "you're weak in Deadlocks," re-reads the whole chapter, and makes the same mistake a week later — because the chapter re-read never touched the actual gap.

**Who exactly:** a student who has already attempted deadlock questions and gotten some wrong, revising alone without a TA to ask "wait, which *part* of this don't I get?"

**What they do today:** re-read the full topic top to bottom, or redo generic practice questions on the same topic, with no signal for which prerequisite idea is actually broken.

**Why that is hard:** a wrong answer on "Deadlock Detection" can come from several different, non-obvious places upstream — resource-allocation reasoning, wait-for-graph construction, or the mutual-exclusion precondition itself — and re-reading the whole topic doesn't tell the student which one is theirs.

*Why it helps: every scope decision below gets checked against this one student and this one topic, not "personalized learning" in general.*

## 2. The Problem This Solves — REQUIRED, JUDGED

A student answers a Deadlock Detection question wrong. A generic system says "weak in Deadlocks" and hands back the whole topic. In reality the student's error traces to one upstream idea — **Resource Allocation** — and once that specific idea is repaired, the *original* Deadlock question type is answered correctly without ever being re-taught directly. The gap isn't "the student doesn't know Deadlocks" — it's "the student is missing one identifiable prerequisite, and nothing today finds or names it before handing back a whole chapter."

*Why it helps: this is the exact case the demo has to reproduce live — if the build can't find this one root cause, it isn't ready.*

## 3. What You Are Building — REQUIRED, JUDGED

**Input:** one hand-curated concept graph for one OS unit (Deadlocks — 5–6 concepts: Mutual Exclusion, Resource Allocation, Wait-For Graph, Circular Wait, Deadlock Detection), plus the student's answers during a short diagnostic session.

**Output:** a confidence score for the target concept, a named root-cause concept (not just "weak topic"), a one-paragraph minimum intervention, and a before/after confidence pair from a counterfactual re-test on a *new* problem.

**Never, however much a user wants it:** no PDF/OCR syllabus upload, no automatically-generated graph, no multiple subjects or units in one run, no Bayesian confidence model, no LLM-authored questions — one curated graph, one unit, one student, diagnosis only.

**Why this is agentic, in our own words:** it holds state across the session — hypotheses, evidence, and confidence persist question to question. It decides its own next step — which probe to ask is chosen from which hypotheses are still alive, not a fixed script. The work is split into steps that can each fail independently (assess → hypothesize → probe → diagnose → intervene → verify), and when two hypotheses remain equally likely it pauses for another probe instead of guessing. Most concretely, it sends work backwards: a wrong answer doesn't move forward to an easier question, it moves *back* into hypothesis generation and a targeted probe on a prerequisite concept — before the system is allowed to decide anything.

*Why it helps: this is what keeps the two-day build from re-growing into the full MICRO/knowledge-graph platform described in the idea doc.*

## 4. A Complete Walkthrough — REQUIRED, JUDGED

Student: Arjun, target concept **Deadlock Detection**.

**Step 1 — Baseline question.** "In this resource-allocation scenario, is the system in a deadlock state?" Arjun answers incorrectly.

**Step 2 — Generate competing hypotheses.** The graph shows Deadlock Detection's direct prerequisites are Resource Allocation and Wait-For Graph construction. Two hypotheses are opened: `resource_allocation_confusion` and `wait_for_graph_confusion`, each starting at 50%.

**Step 3 — Select the discriminating probe.** The pre-authored question bank has one probe tagged as separating these two hypotheses: "Given this allocation table, which process(es) are holding a resource another process needs?" A correct answer here rules out Resource Allocation confusion; a wrong answer strengthens it.

**Step 4 — Arjun answers the probe incorrectly**, picking an option tagged `resource_allocation_confusion`. Hypothesis weights update: Resource Allocation 87%, Wait-For Graph 21%.

**Step 5 — Root cause declared** (above the pre-set 80% threshold): **Resource Allocation**, with the evidence chain: original error → prerequisite link → probe → probe result.

**Step 6 — Minimum intervention.** A short, pre-written explanation is shown — *only* on Resource Allocation (safe/unsafe state), not the whole Deadlocks chapter.

**Step 7 — Counterfactual re-test.** A brand-new deadlock scenario, different processes and resources, is presented — not the same question reworded.

**Step 8 — Arjun answers correctly.** Confidence for Deadlock Detection updates **41% → 89%**, logged with the evidence that produced the jump, not assumed from "he read the explanation."

*Why it helps: this becomes the literal test script — if the build can't reproduce these eight steps live, on a stranger, it isn't demo-ready.*

## 5. Who Is Doing the Thinking — REQUIRED, JUDGED

| Step | Agent | Human | What the human loses if the agent does it |
|---|---|---|---|
| Curating the concept graph and prerequisite links | | ✓ (design time) | The judgment about what actually causes what — this is domain expertise, not something to auto-generate for the demo. |
| Authoring questions + which wrong option maps to which hypothesis | | ✓ (design time) | Same as above — this is the real intellectual content of the build. |
| Selecting which pre-tagged probe best separates two live hypotheses | ✓ | | Nothing — it's a lookup against the authored probe-to-hypothesis tags. |
| Updating hypothesis weights from an answer | ✓ | | Nothing — fixed, documented weight deltas, not a black box. |
| Deciding root cause vs. "ask another probe" | ✓ (threshold) | | Nothing — the 80% threshold is mechanical, but see below. |
| Answering the diagnostic questions and probes | | ✓ (the student) | This is the actual evidence the whole loop runs on. |
| Confirming an ambiguous question was unclear | | ✓ (the student) | Prevents the system from silently mis-scoring a wording problem as a misconception. |

**If your agent asks a person something:** "That question felt ambiguous — was your answer about X or about Y?" — answered by the student mid-session, whenever two hypotheses stay within a few points of each other after the maximum number of probes for that concept.

**What happens if nobody answers:** the session times out on that prompt; the concept is marked "insufficient evidence" in the report instead of a forced diagnosis.

*Why it helps: if this table reads "the agent" everywhere except the two curation rows, there's no real judgment happening at runtime — the probe-selection and hypothesis-update rows are where the loop actually earns the word "agent."*

## 6. The State Machine — REQUIRED, JUDGED

**States:** Start → SelectTarget → AskQuestion → AwaitAnswer → Evaluate → (Correct: UpdateState → SelectTarget) → (Incorrect: GenerateHypotheses → SelectProbe → AwaitProbeAnswer → EvaluateProbe) → (Root cause ≥80%: SelectIntervention → ShowIntervention → CounterfactualRetest → AwaitRetestAnswer → EvaluateRetest → UpdateState → Report) → (Still ambiguous, probes remaining: SelectProbe again) → (Still ambiguous, probes exhausted: AskClarify [WAITING] → Report as "insufficient evidence") → End → PersistState.

| State | Type | What moves it on |
|---|---|---|
| AskQuestion / GenerateHypotheses / SelectProbe / EvaluateProbe | Active | Run automatically from stored graph + question bank + current hypothesis weights. |
| AwaitAnswer / AwaitProbeAnswer | Waiting | The student's submitted answer. |
| AskClarify | Waiting | The student's direct answer, or a timeout resolving to "insufficient evidence." |
| CounterfactualRetest → AwaitRetestAnswer | Waiting | A brand-new problem on the target concept; the student's answer. |
| Report / PersistState | Finished | Session ends; a later run reads this state back (Section 9). |

**What can send work backwards:** an incorrect answer sends the run from Evaluate back into GenerateHypotheses → SelectProbe — re-testing a prerequisite concept from a different angle rather than lowering difficulty and moving on. A still-ambiguous result after a probe sends the run back into SelectProbe again rather than forcing a diagnosis.

**Spend limit:** maximum 3 probes per hypothesis set before falling back to AskClarify. **Revision limit:** at most one hypothesis re-open per session — if the counterfactual re-test still fails, the session ends flagged "root cause not confirmed" rather than looping indefinitely.

*Why it helps: the arrows are the actual two-day build — once drawn, each state is one function.*

## 7. The Data Model — OPTIONAL, YOUR USE

```
ConceptNode: concept_id, name, prerequisites[]
LearnerConceptState: concept_id, confidence(0-100), status, last_verified
Question: id, target_concept, prompt, options{}, correct_option,
          hypothesis_tags{option: hypothesis_id}
Hypothesis: id, concept_id, weight(0-100)
DiagnosticSession: target_concept, hypotheses[], probes_used,
                    root_cause, pre_score, post_score, verification_status
```

## 9. Memory Across Sessions — REQUIRED, JUDGED

Arjun runs the tool again the next week on a different Deadlocks question. The agent loads his stored confidence (Deadlock Detection: 89%, Resource Allocation: 89%) and starts from there instead of re-diagnosing from zero — and if he now fails a *different* deadlock question, the report can say "Resource Allocation still holds; this looks like a new gap, not the old one" instead of re-running the same diagnosis. A stateless rerun could only say "you scored X today," with no way to tell a repaired gap from a fresh one.

*Why it helps: this is the section that proves the stored state is doing real work — if nothing reads it back, the persistence isn't earning its place in the spec.*

## 10. Files and Responsibilities — OPTIONAL, YOUR USE

| File | Owns | Done when |
|---|---|---|
| `concept_graph.json` | 5–6 hand-curated Deadlocks concepts + prerequisite edges (Designer) | Every edge reflects a real "if you don't get A, you can't get B" relationship |
| `question_bank.json` | Baseline questions + probes, each wrong option tagged to a hypothesis (Designer) | 8–10 questions across the unit, every wrong option tagged |
| `diagnostic_engine.py` | Hypothesis generation, probe selection, weight updates (Builder) | Reproduces the Section 4 walkthrough on canned input |
| `state_machine.py` | The transitions in Section 6 (Builder) | A full session — question to report — runs end-to-end |
| `session_store.json` (per student) | Persisted `DiagnosticSession` + `LearnerConceptState` (Builder) | A second run loads and extends a prior session |
| `app.py` / `cli.py` | The interface a tester actually uses (Builder) | A stranger completes a session unassisted |

**Model calls:** none required for hypothesis selection or scoring — deliberately rule-based against the authored tags, to keep the loop deterministic and testable in two days. An LLM call is optional, used only to phrase the final report in plain language.

## 11. What This Deliberately Does Not Do — REQUIRED, JUDGED

- No PDF/OCR syllabus upload or parsing — the concept graph is hand-curated for one unit, because an unreliable auto-parsed graph would undermine every diagnosis built on top of it.
- No automatically generated dependency graph — rejected for the same reason; a wrong prerequisite edge is worse than a missing feature.
- No multiple subjects or units in one run — one unit, tested to real depth, beats three units tested shallowly.
- No Bayesian or learned confidence model — fixed, documented weight deltas are transparent and debuggable under demo pressure.
- No LLM-generated questions — hand-authored questions with hand-tagged misconceptions are the actual intellectual content; an LLM can't reliably invent this.
- No teacher dashboard, spaced repetition, or cross-subject graphs — all explicitly future work (Section 14).

*Why it helps: this list is what stops the build from regrowing into the full platform described in the original idea doc.*

## 12. Build Order — REQUIRED, JUDGED

| Phase | What lands | Hours |
|---|---|---|
| 1 | `concept_graph.json` + `question_bank.json` (tagged) + state machine running end-to-end on scripted/hard-coded answers, no real UI. **Cut line:** if we stop here, we can still show the full question → hypothesis → probe → root-cause path in a terminal. | 0–8 (Day 1) |
| 2 | Real CLI/single-page interface on live input + the backward hypothesis/probe loop working on real answers + AskClarify branch. **Cut line:** if we stop here, we have a working, testable session a stranger can complete alone. | 8–16 (Day 1 end – Day 2 mid) |
| 3 | Counterfactual re-test + session persistence (Section 9) + testing with 3 real students + at least one revision from what we observe. | 16–24 (Day 2) |

**Where the hours will actually go:** not the state machine, but the Designer's judgment on whether each probe genuinely discriminates between hypotheses, and whether the curated graph edges are actually defensible.

## 13. The Demo — OPTIONAL, YOUR USE

Beats, following the walkthrough in Section 4 directly: (1) one-sentence framing of Arjun's situation, (2) live baseline question, answered wrong, (3) show the two competing hypotheses on screen, (4) show MICRO-lite selecting the discriminating probe and why, (5) live probe answer, (6) root cause named with its evidence chain, (7) the minimum intervention — one concept, not a chapter, (8) live counterfactual re-test on a brand-new problem, (9) before/after confidence side by side.

**Which beat is the argument:** beat 4 — naming *why* this probe was chosen over another — is what proves this is reasoning about competing causes, not a scripted quiz.

**What is live vs. recorded:** all nine beats live with a volunteer; a second, pre-recorded run from a prior session demonstrates Section 9's memory if time allows.

## 14. How This Grows — OPTIONAL, YOUR USE

Automatic graph generation becomes viable once there's a curated graph to validate LLM suggestions against, rather than trusting them outright. PDF/OCR syllabus ingestion and multiple subjects are a parsing-and-scale problem layered on top of an already-working diagnostic loop, not a prerequisite for it. A true information-gain-based MICRO engine (Bayesian updating, expected-value probe selection) replaces the fixed-weight rules here once there's a real question bank large enough to make that worth building. Connecting to a GitHub-based skill-verification layer — treating a student's own code as an additional evidence source alongside syllabus answers — is a later integration, not part of this build, and keeps SyllabusMind's diagnostic core independent of it.

## 15. What You Are Least Sure About — REQUIRED, JUDGED

- Whether two competing hypotheses and one discriminating probe is really enough to convince a judge this is diagnosis, not a two-question quiz with extra steps.
- Whether a hand-curated 5–6-node graph will look credible to judges or read as cherry-picked for the demo.
- Whether the 41%→89% counterfactual jump will look like a genuine measured result or a staged number — we don't yet know how a real student's re-test score will actually move.

*Why it helps: writing these down now turns them into a ten-minute test on Saturday instead of a question we can't answer live on Sunday.*

## 16. Claims to Verify — OPTIONAL, YOUR USE

| Claim | How to check | Checked? |
|---|---|---|
| The Step 3 probe actually discriminates between the two hypotheses in practice, not just on paper | Run the walkthrough by hand against 3 different wrong-answer patterns | No |
| A rule-based (non-model) hypothesis update is legible enough for a judge to follow live | Walk a non-teammate through the evidence chain on paper | No |
| A student can complete baseline → probe → intervention → re-test in under 10 minutes unassisted | Time the first real test session in Phase 3 | No |
