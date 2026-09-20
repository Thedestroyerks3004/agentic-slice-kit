/**
 * The agent's read of a result: what the student's misses have in common, why each was wrong, the idea in a few
 * sentences, why a confident mistake matters, and why to start where the page says. Everything is built from the
 * student's real answers (the question, what they picked, the right answer, how sure they were, the belief the
 * wrong option was written to reveal). One batched model call writes it; a deterministic version made from the
 * same facts shows instantly and is used whenever the model cannot answer, so the page is never empty and the
 * model can never invent a fact that is not in the data.
 */
import type { AnswerEntry, ConceptGraph, Confidence, LogEntry, NodeBelief } from '../engine/types';
import { isDanger } from '../engine/mastery';
import { neighborhood, unlocks } from '../engine/graph';
import { buildReport } from './report';
import { generateJSON } from './llm';

/* ------------------------------------------------------------------ facts */

export interface MissFact {
  question: string;
  chosen: string;
  correct?: string;
  confidence: Confidence;
  belief?: string;
  explanation?: string;
  before: number; // mastery before / after this answer
  after: number;
}
export interface TopicFact {
  id: string;
  label: string;
  description?: string;
  state: 'weak' | 'shaky';
  mastery: number;
  answers: number;
  danger: boolean;
  unlocks: number; // topics that build on it, directly or not
  prerequisites: string[];
  misses: MissFact[]; // the most recent wrong answers, at most three
}
export interface Facts {
  assessed: number;
  total: number;
  topics: TopicFact[]; // topics with at least one wrong answer, in the order the report lists them
}

/** Only topics that need work or are developing, and only if the student actually missed something there. */
export function buildFacts(g: ConceptGraph, beliefs: Record<string, NodeBelief>, log: LogEntry[]): Facts {
  const r = buildReport(g, beliefs);
  const topics: TopicFact[] = [];
  for (const row of [...r.needs, ...r.developing]) {
    const misses = log.filter((e): e is AnswerEntry => e.type === 'answer' && e.nodeId === row.id && !e.correct).slice(-3);
    if (!misses.length) continue;
    const node = g.nodes.find((n) => n.id === row.id)!;
    topics.push({
      id: row.id, label: row.label, description: node.description, state: row.state === 'weak' ? 'weak' : 'shaky', mastery: row.mastery, answers: row.answers,
      danger: isDanger(beliefs[row.id]), unlocks: unlocks(g, row.id).length, prerequisites: neighborhood(g, row.id).prereqs.map((n) => n.label),
      misses: misses.map((m) => ({ question: m.questionText, chosen: m.chosen, correct: m.correctAnswer, confidence: m.confidence, belief: m.belief, explanation: m.explanation, before: m.masteryBefore, after: m.masteryAfter })),
    });
  }
  return { assessed: r.assessed, total: r.total, topics };
}

/** Changes whenever anything the insights depend on changes, so a result is generated once per state of the answers. */
export function factsSignature(f: Facts): string {
  const raw = JSON.stringify([f.assessed, f.total, f.topics.map((t) => [t.id, t.state, t.danger, t.misses.map((m) => [m.question, m.chosen, m.confidence])])]);
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ------------------------------------------------------------------ the insights */

export interface TopicInsight {
  why: string[]; // one model-written line per miss, in order; '' when unavailable (never a template)
  thread: string | null; // what the misses share, only when there are two or more
  explainer: string; // the idea in a few sentences, with the correct reasoning
  confident: string | null; // why a confident mistake matters for this student, only for such topics
  start: string | null; // why to start here, only for the topic listed first
  trend: string | null; // is the confidence a pattern across two or more misses, or a one-off
}
export interface Insights {
  takeaway: string;
  scoreNote: string | null; // once per page: why confident wrong answers move the score more
  topics: Record<string, TopicInsight>;
  source: 'agent' | 'auto';
}

const SURE_WORD: Record<Confidence, string> = { high: 'certain', medium: 'fairly sure', low: 'guessing' };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
/** "Believes any blocked transaction is a deadlock" -> "you believe any blocked transaction is a deadlock". */
const youBelieve = (b: string) => b.replace(/^believes\s+/i, 'you believe ').replace(/^thinks\s+/i, 'you think ');

const sharedBelief = (t: TopicFact) => {
  if (t.misses.length < 2) return null;
  const first = norm(t.misses[0].belief);
  return first && t.misses.every((m) => norm(m.belief) === first) ? t.misses[0].belief! : null;
};

/** Confident = fairly sure or certain. Wrong and guessing is an expected gap; wrong and sure is a wrong mental model. */
export const isConfident = (c: Confidence) => c !== 'low';
const pctOf = (x: number) => `${Math.round(x * 100)}%`;

/** Pattern or one-off, from the confidence across the misses. Silent for a single miss or when every miss was a guess. */
export function confidenceTrend(misses: MissFact[]): string | null {
  if (misses.length < 2 || !misses.some((m) => isConfident(m.confidence))) return null;
  const first = misses[0], last = misses[misses.length - 1];
  const same = misses.every((m) => m.confidence === first.confidence);
  if (!same) return 'Your confidence varied across these misses, so this looks like a one-off rather than a consistent overconfidence.';
  return `Your confidence stayed the same across ${misses.length === 2 ? 'both' : 'all'} misses (${SURE_WORD[first.confidence]}) even though your score dropped from ${pctOf(first.before)} to ${pctOf(last.after)}. Worth noticing that you are not detecting these mistakes as you make them.`;
}

/** What the page says when the model cannot: built only from the facts, and only claims what the data shows. */
export function fallbackInsights(f: Facts): Insights {
  const topics: Record<string, TopicInsight> = {};
  f.topics.forEach((t, idx) => {
    const shared = sharedBelief(t);
    const why = t.misses.map(() => ''); // never templated: an empty line means the model has not explained it, and the page says so
    const withExplanation = [...t.misses].reverse().find((m) => m.explanation);
    const explainer = withExplanation
      ? sentence(withExplanation.explanation!)
      : `${t.misses[t.misses.length - 1].correct ? `The correct answer was “${t.misses[t.misses.length - 1].correct}”. ` : ''}${t.description ? `This topic covers: ${t.description}` : ''}`.trim();
    const high = t.misses.filter((m) => m.confidence === 'high').length;
    const mid = t.misses.filter((m) => m.confidence === 'medium').length;
    const sureParts = [high ? `certain on ${high}` : '', mid ? `fairly sure on ${mid}` : ''].filter(Boolean).join(' and ');
    topics[t.id] = {
      why,
      thread: shared ? `${t.misses.length === 2 ? 'Both' : 'All'} misses point to the same gap: ${youBelieve(shared)}.` : null,
      explainer,
      confident: t.danger ? `You were ${sureParts} of your ${plural(t.misses.length, 'wrong answer')} here. Being sure and wrong points to a mental model that needs correcting, not just a missing fact.` : null,
      trend: confidenceTrend(t.misses),
      start: idx === 0 && t.state === 'weak'
        ? `Start here — ${t.label} ${t.unlocks ? `blocks ${plural(t.unlocks, 'other topic')}` : 'is your weakest result'}${t.danger ? ', and you were sure on a wrong answer' : ''}${shared ? `; ${t.misses.length === 2 ? 'both' : 'all'} misses were on the same idea` : ''}.`
        : null,
    };
  });
  const top = f.topics[0];
  const shared = top ? sharedBelief(top) : null;
  let takeaway: string;
  if (!f.assessed) takeaway = 'Answer a few questions and the agent will summarise where your gap is.';
  else if (!top) takeaway = `Based on ${plural(f.assessed, 'topic')}, nothing is flagged yet. Keep going to confirm the rest.`;
  else {
    const caution = f.assessed < 3 ? ' Worth confirming with a few more questions before trusting this.' : '';
    takeaway = `Based on ${plural(f.assessed, 'topic')}, ${top.label} needs the most work${shared ? `: ${youBelieve(shared)}` : ''}.${caution}`;
  }
  const scoreNote = f.topics.some((t) => t.misses.some((m) => isConfident(m.confidence)))
    ? 'Why the score moved: a confident wrong answer lowers it more than a guess would, because it suggests a misunderstanding rather than a missing fact.'
    : null;
  return { takeaway, scoreNote, topics, source: 'auto' };
}

/* ------------------------------------------------------------------ the model call */

/** A "why" that only restates the wrong option is not an explanation, so it is dropped and the page says it is unavailable. */
export const isRealExplanation = (w: string) => w.trim().length >= 40 && !/\b(is|are) not (the )?(right|correct)( answer)?\b/i.test(w);

const tight = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * A cheap consistency guard, not full entailment: if the text explicitly names something as "the correct
 * answer/option/choice", that claim must actually match the correct answer we gave the model. Catches a
 * model that flips or invents the correct answer while writing the explanation; anything it doesn't
 * explicitly claim is left alone, since this is a substring check, not fact-checking the whole sentence.
 */
export function contradictsCorrect(text: string, correct?: string): boolean {
  if (!correct) return false;
  const target = tight(correct);
  if (!target) return false;
  const claims = [...text.matchAll(/correct (?:answer|option|choice) is[^"“”.]{0,20}["“]([^"”]+)["”]/gi)].map((m) => m[1]);
  return claims.some((c) => {
    const claim = tight(c);
    return claim.length > 0 && !target.includes(claim) && !claim.includes(target);
  });
}
const fb_trend = (t: TopicFact) => confidenceTrend(t.misses) !== null;
const trim = (s: unknown, n: number) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);

export const INSIGHT_PROMPT = (f: Facts) => `You are a tutor reading one student's diagnostic results for a database course. Below are FACTS about the topics they missed questions on. Write short, plain, second-person insights ("you"). Use ONLY these facts: do not invent scores, questions or answers. Avoid jargon about scoring.
Return JSON {"takeaway":string,"topics":[{"id":string,"why":[string],"thread":string|null,"explainer":string,"confident":string|null,"start":string|null,"trend":string|null}]}.
- takeaway: ONE sentence for the whole result. Say how many topics it is based on (${f.assessed} of ${f.total}) and, if that is fewer than 3 or under half, that it is worth confirming before trusting it. Name the underlying gap, not just the topic.
- why: one entry per miss, in the same order as the misses. 1 to 2 plain-language sentences that do three things: (1) say what the option the student chose ("youChose") actually means or is used for, (2) say which correct concept it is being confused with (use "correctAnswer" and the topic's "covers"), (3) state the precise distinction between the two. Example for the question "A deadlock requires, among others, the condition:" answered "Timestamps": "Timestamps belong to timestamp ordering, a concurrency control protocol used to prevent deadlock, not one of the four necessary conditions for it (mutual exclusion, hold-and-wait, no preemption, circular wait). You are mixing up a prevention technique with the definition of the problem itself."
  Never just say the option is wrong or restate it. Always name the specific misconception. No jargon beyond what the question itself uses.
- thread: only if the topic has 2+ misses that share one underlying gap: one line naming it. Otherwise null.
- explainer: 2 to 3 sentences of the correct reasoning behind the idea, so the student can fix the gap now.
- confident: only if danger is true: one or two sentences on why being sure and wrong matters for this student, referring to how sure they were. Otherwise null.
- trend: only if the topic has 2+ misses and at least one was fairly sure or certain: one line saying whether confidence was the same across them (a pattern of overconfidence, not noticing mistakes) or varied (a one-off). Otherwise null.
- start: only for the FIRST topic in the list: why to start here, mentioning what it blocks (unlocks) and any shared gap. Otherwise null.
Do not deliberate at length: output the JSON directly.

FACTS:
${JSON.stringify(f.topics.map((t) => ({ id: t.id, topic: t.label, covers: t.description, state: t.state, danger: t.danger, unlocks: t.unlocks, prerequisites: t.prerequisites, misses: t.misses.map((m) => ({ question: m.question, youChose: m.chosen, correctAnswer: m.correct, howSure: SURE_WORD[m.confidence], likelyBelief: m.belief, explanation: m.explanation })) })))}`;

interface Parsed {
  takeaway: string;
  topics: Record<string, Partial<TopicInsight>>;
}

export const validateInsights = (f: Facts) => (x: unknown): Parsed | null => {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  const takeaway = trim(o.takeaway, 320);
  if (!takeaway || !Array.isArray(o.topics)) return null;
  const known = new Map(f.topics.map((t) => [t.id, t]));
  const topics: Record<string, Partial<TopicInsight>> = {};
  for (const raw of o.topics) {
    if (typeof raw !== 'object' || raw === null) continue;
    const t = raw as Record<string, unknown>;
    const fact = typeof t.id === 'string' ? known.get(t.id) : undefined;
    if (!fact) continue;
    topics[fact.id] = {
      why: Array.isArray(t.why)
        ? t.why.map((w, i) => {
            const x = trim(w, 400) ?? '';
            return isRealExplanation(x) && !contradictsCorrect(x, fact.misses[i]?.correct) ? x : '';
          })
        : undefined,
      thread: fact.misses.length >= 2 ? trim(t.thread, 260) : null,
      explainer: trim(t.explainer, 600) ?? undefined,
      confident: fact.danger ? trim(t.confident, 360) : null,
      start: fact.id === f.topics[0]?.id ? trim(t.start, 300) : null,
      trend: fb_trend(fact) ? trim(t.trend, 300) : null,
    };
  }
  return { takeaway, topics };
};

/** Model text where it is valid, the deterministic text everywhere else. */
export function mergeInsights(fallback: Insights, parsed: Parsed): Insights {
  const topics: Record<string, TopicInsight> = {};
  for (const [id, fb] of Object.entries(fallback.topics)) {
    const m = parsed.topics[id] ?? {};
    topics[id] = {
      why: fb.why.map((line, i) => m.why?.[i] || line),
      thread: m.thread ?? fb.thread,
      explainer: m.explainer ?? fb.explainer,
      confident: m.confident ?? fb.confident,
      start: m.start ?? fb.start,
      trend: m.trend ?? fb.trend,
    };
  }
  return { takeaway: parsed.takeaway, scoreNote: fallback.scoreNote, topics, source: 'agent' };
}

export const insightCache = new Map<string, Insights>();

/** One batched call for the whole page. Falls back to the deterministic insights on any failure. */
export async function generateInsights(f: Facts): Promise<Insights> {
  const fb = fallbackInsights(f);
  if (!f.topics.length) return fb; // nothing was missed, so there is nothing for the model to explain
  const r = await generateJSON<Parsed | null>({
    task: 'rootcause',
    prompt: INSIGHT_PROMPT(f),
    validate: validateInsights(f),
    fallback: () => null,
    maxTokens: 3500,
    timeoutMs: 40000,
  });
  return r.live && r.value ? mergeInsights(fb, r.value) : fb;
}

