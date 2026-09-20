/**
 * The only place that talks to a model from the app. Every call: JSON only, schema-validated by the
 * caller, one retry on a different model, then a caller-supplied fallback. The model never returns a
 * score or a state; those live in src/engine.
 */
import { tolerantParse } from './json';
import { setStage } from './agentStatus';

export type Task = 'extract' | 'question' | 'crosscheck' | 'propagate' | 'rootcause';

const LS_KEY = 'sm.apiKey';
const LS_MODELS = 'sm.models.v3';

export const OPENAI_MODELS: Record<Task, string> = {
  extract: 'gpt-4.1-mini',
  question: 'gpt-4.1-mini',
  crosscheck: 'gpt-4o-mini',
  propagate: 'gpt-4o-mini',
  rootcause: 'gpt-4o-mini',
};
/** Free model first (the shared key has almost no paid credit); a paid mini model is the retry. */
export const OPENROUTER_MODELS: Record<Task, string> = {
  extract: 'nvidia/nemotron-3-super-120b-a12b:free',
  question: 'nvidia/nemotron-3-super-120b-a12b:free',
  crosscheck: 'qwen/qwen3.8-27b:free',
  propagate: 'nvidia/nemotron-3-super-120b-a12b:free',
  rootcause: 'nvidia/nemotron-3-super-120b-a12b:free',
};
export const DEFAULT_MODELS = OPENROUTER_MODELS;

/**
 * $ per million tokens, for every model this app actually wires up by default. A model not listed here
 * (a custom one typed into Settings) is priced at $0 for the estimate — flagged as "unpriced" rather than
 * silently shown as free, so the running total is a floor, never a false sense of safety.
 */
export const PRICING: Record<string, { in: number; out: number }> = {
  'nvidia/nemotron-3-super-120b-a12b:free': { in: 0, out: 0 },
  'qwen/qwen3.8-27b:free': { in: 0, out: 0 },
  'gpt-4.1-mini': { in: 0.40, out: 1.60 },
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  'openai/gpt-4o-mini': { in: 0.15, out: 0.60 }, // same model, OpenRouter's provider-prefixed slug
};
export const isPriced = (model: string) => model in PRICING;

const real = (k: string) => (/^sk-/.test(k.trim()) ? k.trim() : ''); // ignores the .env.local placeholder
/** Key order: VITE_OPENAI_API_KEY from .env.local (baked into the bundle), then Settings. */
const ENV_KEY = real((import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ?? '');

/**
 * Session-only "simulate offline" switch, for demoing the backup path on demand. It is checked before
 * ENV_KEY or the Settings key, so it forces every call onto backup regardless of what's configured —
 * no restart needed, since a baked-in .env.local key would otherwise always win. Not persisted: it
 * resets to false on reload, so a demo never accidentally stays offline.
 */
let offline = false;
export const getSimulateOffline = () => offline;
export const setSimulateOffline = (v: boolean) => {
  offline = v;
};

export const getKey = () => {
  if (offline) return '';
  if (ENV_KEY) return ENV_KEY;
  try {
    return real(localStorage.getItem(LS_KEY) || '');
  } catch {
    return '';
  }
};
export const setKey = (k: string) => localStorage.setItem(LS_KEY, k.trim());
export const hasModel = () => !!getKey();
/** sk-or-... keys are OpenRouter keys: same request shape, different endpoint and model names. */
export const isOpenRouter = () => getKey().startsWith('sk-or-');

export const getModels = (): Record<Task, string> => {
  const base = isOpenRouter() ? OPENROUTER_MODELS : OPENAI_MODELS;
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(LS_MODELS) || '{}') };
  } catch {
    return base;
  }
};
export const setModels = (m: Partial<Record<Task, string>>) => localStorage.setItem(LS_MODELS, JSON.stringify(m));

/** Rough per-task token and dollar counter, so the demo can show a running total live, not just at the end. */
export interface TaskUsage { calls: number; tokens: number; promptTokens: number; completionTokens: number; fallbacks: number; cost: number; unpriced: boolean }
export const usage: Record<string, TaskUsage> = {};
const bump = (task: string, model: string, promptTokens = 0, completionTokens = 0, fallback = false) => {
  const u = (usage[task] ??= { calls: 0, tokens: 0, promptTokens: 0, completionTokens: 0, fallbacks: 0, cost: 0, unpriced: false });
  const price = PRICING[model];
  u.calls += fallback ? 0 : 1;
  u.tokens += promptTokens + completionTokens;
  u.promptTokens += promptTokens;
  u.completionTokens += completionTokens;
  u.fallbacks += fallback ? 1 : 0;
  if (!fallback) {
    if (price) u.cost += (promptTokens / 1e6) * price.in + (completionTokens / 1e6) * price.out;
    else if (promptTokens + completionTokens > 0) u.unpriced = true; // real tokens spent on a model we can't price
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('sm-usage')); // no window under node (tests)
};
/** Total estimated spend across every task this session. A floor, not a guarantee: see TaskUsage.unpriced. */
export const totalCost = () => Object.values(usage).reduce((s, u) => s + u.cost, 0);
export const hasUnpriced = () => Object.values(usage).some((u) => u.unpriced);
/** "$0.0031" style, with enough decimals to show sub-cent amounts rather than rounding them to "$0.00". */
export const formatCost = (n: number) => (n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/** Escalate from a free (cheap, occasionally flaky) model to a real paid one on retry, never to another free model. */
export const retryModel = (primary: string) => (primary.endsWith(':free') ? (isOpenRouter() ? 'openai/gpt-4o-mini' : 'gpt-4o-mini') : primary);

async function callOnce(task: Task, prompt: string, model: string, maxTokens: number, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(isOpenRouter() ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getKey()}`,
        ...(isOpenRouter() ? { 'X-Title': 'SyllabusMind' } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Reply with a single JSON object only. No prose, no markdown fences.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const why = res.status === 401 ? ' (key rejected)' : res.status === 404 ? ' (model name not available)' : res.status === 429 ? ' (rate limited)' : res.status === 402 ? ' (out of credit)' : '';
      throw new Error(`${isOpenRouter() ? 'OpenRouter' : 'OpenAI'} ${res.status}${why}`);
    }
    const data = await res.json();
    bump(task, model, data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0);
    return tolerantParse(data.choices?.[0]?.message?.content ?? '');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Circuit breaker. A rejected key or an empty account will not fix itself mid-session, and a model that keeps
 * timing out would make every question wait. After such failures skip live calls for a while and go straight
 * to the backup set, so a student never sits through repeated dead retries.
 */
let paused: { until: number; why: string } | null = null;
let timeouts = 0;
const pause = (ms: number, why: string) => {
  paused = { until: Date.now() + ms, why };
};
export const modelPaused = () => (paused && Date.now() < paused.until ? paused.why : null);

/** validate returns the typed value or null. Try the task's model, retry once on the fallback model, then the fallback value. */
export async function generateJSON<T>(opts: {
  task: Task;
  prompt: string;
  validate: (x: unknown) => T | null;
  fallback: () => T;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number; // per attempt; interactive callers keep this short so a slow model falls back quickly
}): Promise<{ value: T; live: boolean; error?: string }> {
  let error = hasModel() ? '' : 'no API key set';
  const stopped = modelPaused();
  if (stopped) error = `${stopped}; using the backup set`;
  if (hasModel() && !stopped) {
    const primary = opts.model ?? getModels()[opts.task];
    let attempt = 0;
    for (const model of [primary, retryModel(primary)]) {
      setStage(attempt++ === 0 ? 'asking' : 'retrying');
      try {
        const reply = await callOnce(opts.task, opts.prompt, model, opts.maxTokens ?? 2500, opts.timeoutMs ?? 120000);
        setStage('checking');
        const v = opts.validate(reply);
        if (v) {
          timeouts = 0;
          setStage('ready');
          return { value: v, live: true };
        }
        error = 'the model reply did not match the expected format';
      } catch (e) {
        error = e instanceof Error ? (e.name === 'AbortError' ? 'the model took too long to answer' : e.message) : 'request failed';
        if (/ (401|402|403)/.test(error)) {
          pause(10 * 60_000, error);
          break;
        }
        if (e instanceof Error && e.name === 'AbortError' && ++timeouts >= 2) {
          pause(10 * 60_000, error);
          break;
        }
      }
    }
  }
  setStage('backup');
  bump(opts.task, '', 0, 0, true);
  const value = opts.fallback();
  setStage('ready');
  return { value, live: false, error };
}
