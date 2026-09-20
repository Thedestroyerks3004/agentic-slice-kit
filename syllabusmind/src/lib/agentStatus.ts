/**
 * A visible, plain-language account of what the agent is doing right now — not a log, just the current
 * step, broadcast the same way llm.ts already broadcasts token usage ('sm-usage'), so any screen can
 * show it without threading it through every call site. This exists so a person watching the app (a
 * teammate, a tester, a judge) sees the agent actually working through its steps — asking a model,
 * checking what came back, falling back — instead of a bare spinner that could mean anything.
 */
export type AgentStage = 'asking' | 'checking' | 'retrying' | 'backup' | 'ready' | null;

export const STAGE_LABEL: Record<Exclude<AgentStage, null>, string> = {
  asking: 'Asking the model to write questions',
  checking: 'Checking the reply is well-formed',
  retrying: 'That model was slow or malformed — trying a second one',
  backup: 'Using the pre-written backup set',
  ready: 'Ready',
};

// A dedicated EventTarget rather than `window`: works the same under the browser bundle and under the
// (window-less) test environment, with no guard needed either place.
const bus = new EventTarget();
const STAGE_EVENT = 'stage';

let stage: AgentStage = null;
export const getStage = () => stage;
export const setStage = (s: AgentStage) => {
  stage = s;
  bus.dispatchEvent(new Event(STAGE_EVENT));
};
/** Subscribe to stage changes; returns an unsubscribe function. */
export const onStageChange = (fn: () => void) => {
  bus.addEventListener(STAGE_EVENT, fn);
  return () => bus.removeEventListener(STAGE_EVENT, fn);
};
