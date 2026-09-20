import { afterEach, describe, expect, it } from 'vitest';
import { generateJSON, getKey, getSimulateOffline, hasModel, setSimulateOffline } from './llm';
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
