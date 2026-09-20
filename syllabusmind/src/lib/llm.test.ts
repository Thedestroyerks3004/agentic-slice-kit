import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCost, generateJSON, getKey, getSimulateOffline, hasModel, hasUnpriced, isPriced, OPENAI_MODELS, OPENROUTER_MODELS, PRICING, retryModel, setSimulateOffline, totalCost, usage } from './llm';
import { getStage, onStageChange, setStage } from './agentStatus';

describe('the simulate-offline toggle', () => {
  afterEach(() => setSimulateOffline(false)); // session-only: never leak into another test or a reload

  it('defaults to off', () => {
    expect(getSimulateOffline()).toBe(false);
  });

  it('forces getKey() to empty, and hasModel() to false, regardless of any configured key', () => {
    setSimulateOffline(true);
    expect(getSimulateOffline()).toBe(true);
    expect(getKey()).toBe('');
    expect(hasModel()).toBe(false);
  });

  it('stops forcing once switched back off', () => {
    setSimulateOffline(true);
    setSimulateOffline(false);
    expect(getSimulateOffline()).toBe(false);
  });
});

describe('the visible agent status, on the no-key/offline path', () => {
  afterEach(() => {
    setSimulateOffline(false);
    setStage(null);
  });

  it('skips straight to backup, then ready, without ever claiming it asked a model', async () => {
    setSimulateOffline(true); // forces hasModel() false, so generateJSON never calls the network
    const seen: string[] = [];
    const off = onStageChange(() => seen.push(String(getStage())));
    const r = await generateJSON<string>({ task: 'question', prompt: 'p', validate: () => null, fallback: () => 'backup-value' });
    off();
    expect(r).toMatchObject({ value: 'backup-value', live: false });
    expect(seen).toEqual(['backup', 'ready']); // never 'asking' or 'checking': no key means no network call at all
  });
});

describe('the price table', () => {
  it('prices every model this app actually defaults to', () => {
    for (const m of ['nvidia/nemotron-3-super-120b-a12b:free', 'qwen/qwen3.8-27b:free', 'gpt-4.1-mini', 'gpt-4o-mini', 'openai/gpt-4o-mini']) {
      expect(isPriced(m)).toBe(true);
    }
    expect(isPriced('some-custom-model-nobody-priced')).toBe(false);
  });
  it('never defaults a task to a model missing from the price table (the class of bug that let a dead retry model slip in)', () => {
    for (const m of Object.values(OPENROUTER_MODELS)) expect(isPriced(m)).toBe(true);
    for (const m of Object.values(OPENAI_MODELS)) expect(isPriced(m)).toBe(true);
  });
  it('retries a free model on a real, priced paid model — never on another free model that might not exist', () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'sm.apiKey' ? 'sk-or-test-key' : null), setItem: () => {}, removeItem: () => {} });
    const target = retryModel('nvidia/nemotron-3-super-120b-a12b:free');
    expect(target).toBe('openai/gpt-4o-mini');
    expect(isPriced(target)).toBe(true);
    vi.unstubAllGlobals();
  });
  it('prices the free-tier OpenRouter defaults at exactly $0', () => {
    expect(PRICING['nvidia/nemotron-3-super-120b-a12b:free']).toEqual({ in: 0, out: 0 });
  });
});

describe('formatCost', () => {
  it('shows sub-cent amounts with enough decimals to be visible, not rounded to $0.00', () => {
    expect(formatCost(0)).toBe('$0');
    expect(formatCost(0.0031)).toBe('$0.0031');
    expect(formatCost(1.2)).toBe('$1.20');
  });
});

describe('live cost tracking, end to end through a real (mocked) call', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    for (const k of Object.keys(usage)) delete usage[k];
  });

  it('turns prompt/completion tokens from the API response into a dollar cost, priced by the model actually used', async () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'sm.apiKey' ? 'sk-or-test-key' : null), setItem: () => {}, removeItem: () => {} });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: { prompt_tokens: 1000, completion_tokens: 500 },
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    }) as unknown as typeof fetch;

    const r = await generateJSON<{ ok: boolean }>({
      task: 'question',
      prompt: 'p',
      model: 'gpt-4o-mini',
      validate: (x) => x as { ok: boolean },
      fallback: () => ({ ok: false }),
    });

    expect(r).toMatchObject({ value: { ok: true }, live: true });
    // gpt-4o-mini: $0.15/M in, $0.60/M out -> 1000*0.15/1e6 + 500*0.60/1e6
    expect(totalCost()).toBeCloseTo(0.00015 + 0.0003, 8);
    expect(usage.question).toMatchObject({ calls: 1, promptTokens: 1000, completionTokens: 500, unpriced: false });
    expect(hasUnpriced()).toBe(false);
  });

  it('flags a call to an unpriced model instead of silently counting it as free', async () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'sm.apiKey' ? 'sk-or-test-key' : null), setItem: () => {}, removeItem: () => {} });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ usage: { prompt_tokens: 100, completion_tokens: 50 }, choices: [{ message: { content: '{"ok":true}' } }] }),
    }) as unknown as typeof fetch;

    await generateJSON<{ ok: boolean }>({ task: 'crosscheck', prompt: 'p', model: 'some-custom-model-nobody-priced', validate: (x) => x as { ok: boolean }, fallback: () => ({ ok: false }) });

    expect(totalCost()).toBe(0); // no known price, so no invented cost
    expect(hasUnpriced()).toBe(true); // but flagged, so the UI doesn't show it as free
  });
});
