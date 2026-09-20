import { describe, expect, it } from 'vitest';
import { recommendNext } from '../lib/recommend';
import { newBelief, updateBelief } from './mastery';
import { unlocks } from './graph';
import { DBMS_GRAPH } from '../lib/dbmsGraph';
import { STATE_META, STATE_ORDER } from '../lib/states';
import type { NodeBelief } from './types';

const fresh = (): Record<string, NodeBelief> => Object.fromEntries(DBMS_GRAPH.nodes.map((n) => [n.id, newBelief()]));
const right = (b: NodeBelief) => updateBelief(updateBelief(b, true, 'medium'), true, 'medium');
const wrong = (b: NodeBelief) => updateBelief(updateBelief(b, false, 'medium'), false, 'medium');
const mixed = (b: NodeBelief) => updateBelief(updateBelief(b, true, 'medium'), false, 'medium');

describe('what unlocks what', () => {
  it('counts every topic that builds on a topic, directly or not', () => {
    expect(unlocks(DBMS_GRAPH, 'db_fundamentals')).toHaveLength(13);
    expect(unlocks(DBMS_GRAPH, 'transactions_acid').sort()).toEqual(['concurrency_control', 'deadlock_recovery', 'distributed_nosql']);
    expect(unlocks(DBMS_GRAPH, 'normalization')).toEqual([]);
  });
});

describe('recommended next', () => {
  it('starts at the root before anything is checked, and says how much it unlocks', () => {
    const r = recommendNext(DBMS_GRAPH, fresh())!;
    expect(r.nodeId).toBe('db_fundamentals');
    expect(r.action).toBe('check');
    expect(r.headline).toBe('Start here');
    expect(r.unlocks).toBe(13);
  });
  it('moves on to the next unchecked topic, foundations first', () => {
    const b = fresh();
    b.db_fundamentals = right(b.db_fundamentals);
    const r = recommendNext(DBMS_GRAPH, b)!;
    expect(r.nodeId).toBe('relational_model');
    expect(r.headline).toBe('Check next');
  });
  it('once everything is checked, recommends a weak topic whose prerequisites are fine', () => {
    const b = fresh();
    for (const n of DBMS_GRAPH.nodes) b[n.id] = right(b[n.id]);
    b.transactions_acid = wrong(b.transactions_acid);
    b.concurrency_control = wrong(b.concurrency_control); // also weak, but its prerequisite is the real cause
    const r = recommendNext(DBMS_GRAPH, b)!;
    expect(r.nodeId).toBe('transactions_acid');
    expect(r.action).toBe('deeper');
  });
  it('prefers a weak topic over a shaky one', () => {
    const b = fresh();
    for (const n of DBMS_GRAPH.nodes) b[n.id] = right(b[n.id]);
    b.sql_fundamentals = mixed(b.sql_fundamentals);
    b.er_model = wrong(b.er_model);
    expect(recommendNext(DBMS_GRAPH, b)!.nodeId).toBe('er_model');
  });
  it('says nothing when everything is strong', () => {
    const b = fresh();
    for (const n of DBMS_GRAPH.nodes) b[n.id] = right(b[n.id]);
    expect(recommendNext(DBMS_GRAPH, b)).toBeNull();
  });
});

describe('the states a student sees', () => {
  it('are five in the legend, with plain names', () => {
    expect(STATE_ORDER).toHaveLength(5);
    expect(STATE_ORDER.map((s) => STATE_META[s].label)).toEqual(['Not checked', 'Needs work', 'Developing', 'Strong', 'Verified']);
  });
  it('never show a score for a topic with no answers', () => {
    // The UI shows a number only when answers > 0; an untouched belief must have none to show.
    expect(newBelief().answers).toBe(0);
  });
});
