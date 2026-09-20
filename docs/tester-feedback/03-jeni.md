# Tester feedback: Jeni (4th year CSE)

## Review

> Idea and implementation is good. In future make the system to accept ppt and books for deep learning.

## What this tells us

The tester wants the system to learn from a student's own material, slides and textbooks, instead of a fixed
syllabus. They framed it as future work.

## What we did

Nothing in the shipped app. This is a roadmap item and is recorded honestly as not built.

- The shipped app covers one subject, Database Management Systems. Its 14-topic graph is hand-written in
  `skillmind/src/lib/dbmsGraph.ts`. It does not read uploaded files.
- An earlier, larger build did include PDF and OCR syllabus upload. It is kept only for reference in
  `skillmind/archive/full-scope/` and is not part of the submission. `PRE-EVENT-ASSETS.md` and
  `SPEC-DIVERGENCE.md` explain why the scope was cut.

## How we would approach it

1. Accept PDF and slide files, and extract text by section.
2. Build the topic graph from the material, and keep the links between topics reviewable by the student.
3. Ground each generated question in a passage from the upload, and show the passage next to the
   explanation when an answer is wrong.
4. Re-use the existing back-edge, so a failed contrast question still reopens a topic.

## Status

Open, and planned for after the event. Not claimed as done.
