/**
 * The only place that talks to a model from the app. Every call: JSON only, schema-validated by the
 * caller, one retry on a different model, then a caller-supplied fallback. The model never returns a
 * score or a state; those live in src/engine.
 */
import { tolerantParse } from './bank';

export type Task = 'extract' | 'question' | 'crosscheck' | 'propagate' | 'rootcause';

const LS_KEY = 'sm.apiKey';
const LS_MODELS = 'sm.models.v3';
const LS_PROP = 'sm.modelPropagation';

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
  crosscheck: 'deepseek/deepseek-v4-flash-0731:free',
  propagate: 'nvidia/nemotron-3-super-120b-a12b:free',
  rootcause: 'nvidia/nemotron-3-super-120b-a12b:free',
};
export const DEFAULT_MODELS = OPENROUTER_MODELS;

const real = (k: string) => (/^sk-/.test(k.trim()) ? k.trim() : ''); // ignores the .env.local placeholder
/** Key order: VITE_OPENAI_API_KEY from .env.local (baked into the bundle), then Settings. */
const ENV_KEY = real((import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ?? '');
export const getKey = () => {
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

/** Per-answer propagation judgment costs one call each, so it is off unless switched on. */
export const modelPropagation = () => {
  try {
    return localStorage.getItem(LS_PROP) === '1';
  } catch {
    return false;
  }
};
export const setModelPropagation = (on: boolean) => localStorage.setItem(LS_PROP, on ? '1' : '0');

/** Rough per-task token counter so the demo can quote a number. */
export const usage: Record<string, { calls: number; tokens: number; fallbacks: number }> = {};
const bump = (task: string, tokens = 0, fallback = false) => {
  const u = (usage[task] ??= { calls: 0, tokens: 0, fallbacks: 0 });
  u.calls += fallback ? 0 : 1;
  u.tokens += tokens;
  u.fallbacks += fallback ? 1 : 0;
  window.dispatchEvent(new Event('sm-usage'));
};

const retryModel = (primary: string) => (primary.endsWith(':free') ? (isOpenRouter() ? 'deepseek/deepseek-v4-flash-0731:free' : 'gpt-4o-mini') : primary);

async function callOnce(task: Task, prompt: string, model: string, maxTokens: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 240000);
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
    bump(task, data.usage?.total_tokens ?? 0);
    return tolerantParse(data.choices?.[0]?.message?.content ?? '');
  } finally {
    clearTimeout(timer);
  }
}

/** validate returns the typed value or null. Try the task's model, retry once on the fallback model, then the fallback value. */
export async function generateJSON<T>(opts: {
  task: Task;
  prompt: string;
  validate: (x: unknown) => T | null;
  fallback: () => T;
  model?: string;
  maxTokens?: number;
}): Promise<{ value: T; live: boolean; error?: string }> {
  let error = hasModel() ? '' : 'no API key set';
  if (hasModel()) {
    const primary = opts.model ?? getModels()[opts.task];
    for (const model of [primary, retryModel(primary)]) {
      try {
        const v = opts.validate(await callOnce(opts.task, opts.prompt, model, opts.maxTokens ?? 2500));
        if (v) return { value: v, live: true };
        error = 'the model reply did not match the expected format';
      } catch (e) {
        error = e instanceof Error ? e.message : 'request failed';
      }
    }
  }
  bump(opts.task, 0, true);
  return { value: opts.fallback(), live: false, error };
}
