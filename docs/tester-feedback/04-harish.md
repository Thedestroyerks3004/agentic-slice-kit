# Tester feedback: Harish (3rd year IT)

## Review

> Looks good but taking too much question in a single go without getting a outline. Maybe adding
> suggestion on wrong question may improve the user experience.

## What this tells us

Two separate points.

1. A long run of questions starts with no outline of what is coming.
2. A wrong answer should come with a suggestion, not just a mark.

## What we did

**Suggestion on a wrong answer: done** (`8fc2b0f`). The moment a student answers wrong, the question card
shows a "Why that was wrong" panel with the correct answer and the question's explanation. When the wrong
option was tagged with a belief, it adds "Your answer suggests: ...". The button reads "Continue", so the
student reads it before moving on. No new model call was added, because each question already carries its
explanation. Before this, explanations appeared only on the results page.

**Too many questions without an outline: partly addressed.**

- The Quick check is still two questions per topic, and the button says how many to expect
  ("Check this topic, 2 questions", "Go deeper, about 8 questions").
- Each screen shows "Question N of M" and a progress bar.
- We did **not** add an upfront outline of what a deep dive will cover, and we did not shorten the eight
  question deep dive.

## Limits to be aware of

Live questions always come with an explanation. The pre-written backup questions mostly do not. On those a
wrong answer shows the correct answer, plus the belief if one is tagged, but no explanation text.

## Status

Suggestion on wrong answers: closed. Outline before a long run: open. A short "what this run will cover"
line before each deep dive is the natural next step.
