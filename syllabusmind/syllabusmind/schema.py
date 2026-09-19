"""The shared contract: every record that crosses a boundary.

Nothing crosses a step boundary as prose. The human boundary is the one place
prose is unavoidable, so a student's reply is converted into an `Answer` before
it may affect anything. Bounds live here (Field limits), not in prompts, and a
list returned by a model is always wrapped, because a bare list is not a schema.

Record kinds written to the store (one row per write, never edited):

    input, session, action, served, answer, unanswered, prediction,
    prediction_result, edge_weight, hypothesis, proof, memory, failure
    (pool runs also write: question, verdict, accepted)
"""
from __future__ import annotations

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, Field

Level = Literal[1, 2, 3]                 # 1 recall, 2 concept, 3 tricky/transfer
Confidence = Literal["guessing", "fairly_sure", "certain"]
OptionKey = Literal["A", "B", "C", "D"]
Phase = Literal["refresh", "diagnostic", "verify", "drilldown", "proof"]
NodeStatus = Literal["unknown", "tentative", "weak", "shaky", "solid", "verified"]
Role = Literal["standard", "discriminating", "control"]


# ------------------------------------------------------------------- the graph

class Node(BaseModel):
    id: str
    name: str
    unit: str = ""
    subtopics: list[str] = Field(default_factory=list)


class Edge(BaseModel):
    """`source` is a prerequisite of `target`. The weight is a hypothesis about
    how strongly; it is reweighted when predictions are tested."""
    source: str
    target: str
    weight: float = Field(default=0.6, ge=0.1, le=1.0)
    rationale: str = ""
    origin: Literal["syllabus_order", "model", "human"] = "human"


class Misconception(BaseModel):
    id: str
    node_id: str
    belief: str = Field(description="One line, e.g. 'assumes any cycle means deadlock'")


class Graph(BaseModel):
    topic: str
    title: str = ""
    nodes: list[Node]
    edges: list[Edge]
    misconceptions: list[Misconception] = Field(default_factory=list)

    def graph_hash(self) -> str:
        """Identity of an approved graph. Memory across sessions is keyed on it."""
        blob = json.dumps(self.model_dump(), sort_keys=True).encode()
        return hashlib.sha256(blob).hexdigest()[:16]

    def node(self, node_id: str) -> Node:
        for n in self.nodes:
            if n.id == node_id:
                return n
        raise KeyError(node_id)

    def prerequisites(self, node_id: str) -> list[str]:
        return [e.source for e in self.edges if e.target == node_id]

    def dependents(self, node_id: str) -> list[str]:
        return [e.target for e in self.edges if e.source == node_id]

    def misconceptions_of(self, node_id: str) -> list[Misconception]:
        return [m for m in self.misconceptions if m.node_id == node_id]

    def belief_text(self, misconception_id: str) -> str:
        for m in self.misconceptions:
            if m.id == misconception_id:
                return m.belief
        return ""


# ------------------------------------------------------------------- questions

class Citation(BaseModel):
    """The model writes these strings, so they are not evidence until
    provenance.check has compared them with what retrieval returned."""
    cite: str = Field(description="doc#ordinal, as Chunk.cite() prints it")
    quote: str = Field(description="Verbatim text from that passage")


class Option(BaseModel):
    key: OptionKey
    text: str
    misconception_id: str | None = None      # set on distractors only


class Question(BaseModel):
    id: str
    node_id: str
    level: Level
    stem: str
    options: list[Option] = Field(min_length=4, max_length=4)
    correct: OptionKey
    explanation: str = ""
    role: Role = "standard"
    pair_id: str | None = None
    probes: str | None = None                # the misconception this question tests
    source: Citation | None = None
    status: Literal["verified", "demoted", "rejected"] = "verified"
    note: str = ""


class GeneratedQuestion(BaseModel):
    """What the generator model returns: one question, cited, distractors tagged."""
    stem: str
    options: list[Option] = Field(min_length=4, max_length=4)
    correct: OptionKey
    explanation: str = ""
    probes: str | None = None
    cite: str
    quote: str


class BlindAnswer(BaseModel):
    """The blind solver sees stem and options only, never the key."""
    choice: OptionKey


class BeliefPick(BaseModel):
    choice: OptionKey


class Objection(BaseModel):
    field: str
    problem: str


class Verdict(BaseModel):
    """What the gate returns. The only record that sends a question back."""
    status: Literal["PASS", "BLOCK"]
    objections: list[Objection] = Field(default_factory=list, max_length=6)


class ProvenanceResult(BaseModel):
    supported: bool
    reason: str = ""


class QuestionPool(BaseModel):
    topic: str
    graph_hash: str
    questions: list[Question]
    generated: int = 0
    rejected: int = 0
    rejection_reasons: dict[str, int] = Field(default_factory=dict)
    notes: str = ""

    def usable(self) -> list[Question]:
        return [q for q in self.questions if q.status == "verified"]


# --------------------------------------------------------------- student side

class Answer(BaseModel):
    """A student's reply AFTER conversion from whatever they clicked or typed."""
    question_id: str
    node_id: str
    level: Level
    chosen: OptionKey
    correct: bool
    confidence: Confidence
    misconception_id: str | None = None
    role: Role = "standard"
    phase: Phase
    round: int = 0                            # proof round, counted from proof history


class NodeBelief(BaseModel):
    node_id: str
    alpha: float = 1.0
    beta: float = 1.0
    n: int = 0
    mastery: float = 0.5
    low: float = 0.0
    high: float = 1.0
    status: NodeStatus = "unknown"
    danger: bool = False


class Prediction(BaseModel):
    """Written BEFORE it is tested, and never edited (the result is a new record)."""
    id: str
    source_id: str
    target_id: str
    predicted: Literal["weak"] = "weak"
    score: float = 0.0
    outcome: Literal["confirmed", "refuted", "untested"] | None = None


class HypothesisDraft(BaseModel):
    misconception_id: str | None = None
    statement: str
    cite: str = ""
    quote: str = ""


class Hypothesis(BaseModel):
    node_id: str
    misconception_id: str | None = None
    statement: str = ""
    citation: Citation | None = None
    status: Literal["supported", "could_not_establish"] = "could_not_establish"
    note: str = ""


class ProofResult(BaseModel):
    node_id: str
    misconception_id: str | None = None
    discriminating_correct: bool | None = None
    control_correct: bool | None = None
    verdict: Literal["verified", "improving", "not_repaired"]
    note: str = ""


class Overall(BaseModel):
    overall: float | None
    low: float | None
    high: float | None
    coverage: float


# ------------------------------------------------------------ session control

class SessionState(BaseModel):
    """Small control record written each step. `hops` is derived from the record
    history by the flow (never from slice.budget), so a retried model call can
    not quietly eat a hop."""
    topic: str = ""
    graph_hash: str = ""
    phase: Phase = "diagnostic"
    theta: float = 0.0
    predicted: bool = False
    focus_node: str | None = None
    current_node: str | None = None
    hops: int = 0
    refresh: list[str] = Field(default_factory=list)
    exhausted_nodes: list[str] = Field(default_factory=list)
    unanswered_nodes: list[str] = Field(default_factory=list)
    finished: bool = False


class Action(BaseModel):
    """What the engine tells the flow to do next. Code decides; the model is
    never asked which step comes next."""
    kind: Literal["ask", "predict", "resolve", "step_down", "climb_back", "finish"]
    phase: Phase | None = None
    node_id: str | None = None
    level: Level | None = None
    role: Role = "standard"
    misconception_id: str | None = None       # proof: which belief is under test
    avoid_misconception: str | None = None    # ask a question probing a different belief
    prediction_id: str | None = None
    focus_node: str | None = None
    reason: str = ""                          # plain language, shown in the agent log


class Report(BaseModel):
    """Numbers only. A narrated version may rephrase these, never change them."""
    topic: str = ""
    graph_hash: str = ""
    overall: float | None = None
    low: float | None = None
    high: float | None = None
    coverage: float = 0.0
    questions_asked: int = 0
    predictions_confirmed: int = 0
    predictions_refuted: int = 0
    predictions_total: int = 0
    verified_nodes: list[str] = Field(default_factory=list)
    improving_nodes: list[str] = Field(default_factory=list)
    danger_nodes: list[str] = Field(default_factory=list)
    unassessed_nodes: list[str] = Field(default_factory=list)
    unanswered_questions: int = 0
    calibration_flags: int = 0
    root_causes: list[str] = Field(default_factory=list)
    memory: dict[str, str] = Field(default_factory=dict)   # node -> holds | regressed
    finished_reason: str = ""
    caveats: list[str] = Field(default_factory=list)
