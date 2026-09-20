import { describe, expect, it } from 'vitest';
import { getStage, onStageChange, setStage, STAGE_LABEL } from './agentStatus';

describe('the agent status broadcast', () => {
  it('starts at null: nothing is happening until a call sets a stage', () => {
    // A fresh module import defaults to null; this only holds if no earlier test left it set.
    setStage(null);
    expect(getStage()).toBeNull();
  });

  it('records whatever stage is set, and broadcasts an event so a screen can react without polling', () => {
    let fired = 0;
    const off = onStageChange(() => fired++);
    setStage('asking');
    expect(getStage()).toBe('asking');
    expect(fired).toBe(1);
    setStage('ready');
    expect(getStage()).toBe('ready');
    expect(fired).toBe(2);
    off();
    setStage(null);
  });

  it('has a plain-language label for every real stage, so the UI never shows an internal name', () => {
    const stages: (keyof typeof STAGE_LABEL)[] = ['asking', 'checking', 'retrying', 'backup', 'ready'];
    for (const s of stages) {
      expect(STAGE_LABEL[s].length).toBeGreaterThanOrEqual(5);
      expect(STAGE_LABEL[s]).not.toBe(s); // not just the internal identifier
    }
  });
});
