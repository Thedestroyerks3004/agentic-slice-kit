export type BeliefState = 'unknown' | 'tentative' | 'weak' | 'shaky' | 'solid' | 'verified';
export type Confidence = 'low' | 'medium' | 'high';

export interface ConceptNode {
  id: string;
  label: string;
  unit: string;
  description?: string;
  parentId?: string; // set for sub-topics created when a topic is drilled into
}
export interface ConceptEdge {
  from: string; // prerequisite
  to: string; // dependent
  weight: number; // 0..1 trust in the prerequisite relationship
}
export interface ConceptGraph {
  id: string;
  title: string;
  source: 'demo' | 'bundle' | 'llm' | 'heuristic';
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

/** Beta(alpha,beta) belief + bookkeeping for one node. */
export interface NodeBelief {
  alpha: number;
  beta: number;
  answers: number;
  confidentWrong: number;
  nudge: number; // propagated offset, bounded, never counts as direct evidence
  verified: boolean;
  reopened?: boolean; // failed a contrast check while looking solid: capped at Shaky until it passes one
}

export type QuestionKind = 'diagnostic' | 'probe' | 'contrast';
export interface Question {
  id: string;
  nodeId: string;
  kind: QuestionKind;
  text: string;
  options: string[];
  correctIndex: number; // stored answer key: pass/fail is a plain comparison
  selfCheck?: boolean; // fallback when no model/curated bank is available
  level?: 1 | 2 | 3; // 1 recall, 2 concept/application, 3 transfer
  misconceptions?: (string | null)[]; // per option: the belief a wrong pick reveals; null for the correct option
  pairId?: string; // contrast pair: a discriminating question and its control share this id
  role?: 'discriminating' | 'control';
}

export interface AnswerEntry {
  type: 'answer';
  id: string;
  at: string;
  nodeId: string;
  questionId: string;
  questionText: string;
  chosen: string;
  correct: boolean;
  confidence: Confidence;
  masteryBefore: number;
  masteryAfter: number;
  kind: QuestionKind;
  phase: 'diagnostic' | 'deepdive';
  misconceptionId?: string; // set when a wrong pick maps to a known wrong belief
}
export interface PropagationEvent {
  type: 'propagation';
  id: string;
  at: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeWeight: number;
  modelWeight: number;
  rawDelta: number;
  appliedDelta: number;
  reason: string;
}
export interface ReopenEvent {
  type: 'reopen';
  id: string;
  at: string;
  nodeId: string;
  questionId: string;
  reason: string;
}
export interface VerifyEvent {
  type: 'verify';
  id: string;
  at: string;
  nodeId: string;
  reason: string;
}
export type LogEntry = AnswerEntry | PropagationEvent | ReopenEvent | VerifyEvent;

export interface StudentSession {
  rollNumber: string;
  name: string;
  syllabusHash: string;
  graphId: string;
  lastActiveAt: string;
}
