import { afterEach, describe, expect, it } from 'vitest';
import { getKey, getSimulateOffline, hasModel, setSimulateOffline } from './llm';

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
