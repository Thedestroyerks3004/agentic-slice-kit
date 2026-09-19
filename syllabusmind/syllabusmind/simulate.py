"""Synthetic students with PLANTED ground truth, to test the agent without people.
Labelled simulation, not human evidence."""
from __future__ import annotations

import random

from slice import callback
from slice.runner import advance

from . import config, content, session_flow
from .schema import Graph


class Student:
    """Holds `beliefs` (misconception ids). Picks a distractor tagged with a held
    belief when there is one; otherwise answers correctly, except for `slip`/`guess`."""

    def __init__(self, beliefs=(), weak_nodes=(), slip=0.05, guess=0.25, seed=0, repaired=()):
        self.beliefs, self.weak, self.slip, self.guess = set(beliefs), set(weak_nodes), slip, guess
        self.repaired, self.rng = set(repaired), random.Random(seed)

    def answer(self, q, phase: str) -> tuple[str, str]:
        held = [o for o in q.options if o.misconception_id in self.beliefs - self.repaired]
        if held:
            return held[0].key, "certain"
        if q.node_id in self.weak:
            return (q.correct if self.rng.random() < self.guess else
                    next(o.key for o in q.options if o.key != q.correct)), "guessing"
        if self.rng.random() < self.slip:
            return next(o.key for o in q.options if o.key != q.correct), "fairly_sure"
        return q.correct, "certain"


def pending_question(store, run_id, topic):
    qs = callback.pending(store, run_id)
    if not qs:
        return None, None
    q = qs[0]
    pool = content.load_pool(topic)
    return q, next((x for x in pool.questions if x.id == q.context.get("question_id")), None)


def play(store, run_id, flow, settings, student: Student, max_turns=80, on_turn=None):
    topic = store.meta(run_id)["topic"]
    for _ in range(max_turns):
        state = advance(store, run_id, flow, settings)
        if state.is_terminal:
            return state
        q, question = pending_question(store, run_id, topic)
        if q is None:
            return state
        if q.context["kind"] == "choose":
            cand = q.context.get("candidates") or []
            callback.answer(store, q.id, session_flow.encode_reply(choose=next((c for c in cand if c in student.weak), "auto")))
        else:
            key, conf = student.answer(question, q.context.get("phase", ""))
            callback.answer(store, q.id, session_flow.encode_reply(choice=key, confidence=conf))
        if on_turn:
            on_turn(store, run_id)
    return store.get_state(run_id)
