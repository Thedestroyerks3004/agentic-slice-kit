export type BeliefState = 'unknown' | 'tentative' | 'weak' | 'shaky' | 'solid' | 'verified';
export type Confidence = 'low' | 'medium' | 'high';

export interface ConceptNode {
  id: string;
  label: string;
  unit: string;
  description?: string;
}
export interface ConceptEdge {
  from: string; // prerequisite
  to: string; // dependent
  weight: number; // 0..1 trust in the prerequisite relationship
}
export interface ConceptGraph {
  id: string;
  title: string;
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

/** Beta(alpha,beta) belief plus bookkeeping for one topic. Direct evidence only. */
export interface NodeBelief {
  alpha: number;
  beta: number;
  answers: number;
  correct: number;
  confidentWrong: number;
  verified: boolean;
  reopened?: boolean; // failed a contrast check while looking solid: capped at Shaky until it passes one
  reopenCount?: number; // how many times this topic has been reopened this session — a revision counter,
  // separate from and never shared with llm.ts's `timeouts` (a network-spend counter). Capped at
  // MAX_REOPENS: once hit, a failed discriminating question still logs the finding but no longer reopens.
}

export type QuestionKind = 'diagnostic' | 'probe' | 'contrast';
export interface Question {
  id: string;
  nodeId: string;
  kind: QuestionKind;
  text: string;
  options: string[];
  correctIndex: number; // stored answer key: pass/fail is a plain comparison
  level?: 1 | 2 | 3; // 1 recall, 2 application, 3 transfer
  misconceptions?: (string | null)[]; // per option: id of the wrong belief a pick reveals; null for the correct option
  beliefs?: (string | null)[]; // per option: the belief in plain words
  pairId?: string; // contrast pair: a discriminating question and its control share this id
  role?: 'discriminating' | 'control';
  explanation?: string; // one or two sentences: why the correct option is right and where the tempting wrong one fails
  source?: 'live' | 'backup' | 'rehearsed';
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
  misconceptionId?: string;
  belief?: string;
  correctAnswer?: string; // the text of the right option, so a miss can be explained later
  explanation?: string;
  source?: 'live' | 'backup' | 'rehearsed'; // where this question came from, for the exported audit trail
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
export type LogEntry = AnswerEntry | ReopenEvent | VerifyEvent;
