/** Calculations: progress, deadlines, item state, stage lists. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progress, itemState, dueInfo, lateDays, stagesFromTemplate, pushId, list } from '../js/model.js';
import { defaultStageTemplate, DEFAULT_STAGES } from '../js/config/app-config.js';

test('new items get the standard 15-stage chain in order', () => {
  const st = list(stagesFromTemplate(defaultStageTemplate()));
  assert.equal(st.length, 15);
  assert.deepEqual(st.map((s) => s.name), DEFAULT_STAGES.map((d) => d[1]));
  assert.ok(st.every((s) => s.status === 'Not Started'));
});

test('progress counts completed stages and ignores Not Applicable', () => {
  const p = progress({ a: { status: 'Completed' }, b: { status: 'Not Applicable' }, c: { status: 'In Progress' }, d: { status: 'Completed' } });
  assert.deepEqual({ done: p.done, total: p.total }, { done: 2, total: 3 });
  assert.equal(progress({}).frac, 0);
});

test('dates never complete a stage; only an open stage can be overdue', () => {
  assert.equal(lateDays({ status: 'In Progress', expEnd: '2026-11-10' }, '2026-11-14'), 4);
  assert.equal(lateDays({ status: 'Completed', expEnd: '2026-11-10' }, '2026-11-14'), 0);
  assert.equal(lateDays({ status: 'Not Applicable', expEnd: '2026-11-10' }, '2026-11-14'), 0);
  assert.equal(dueInfo({ status: 'Waiting', expEnd: '2026-11-14' }, 7, '2026-11-14').key, 'today');
  assert.equal(dueInfo({ status: 'Not Started', expEnd: '2026-11-18' }, 7, '2026-11-14').key, 'soon');
  assert.equal(dueInfo({ status: 'Not Started', expEnd: '2026-12-30' }, 7, '2026-11-14').key, 'upcoming');
  assert.equal(dueInfo({ status: 'Completed', expEnd: '2026-11-01' }, 7, '2026-11-14'), null);
});

test('item state: current stage is the first open one that has started, else the first open one', () => {
  const s = { a: { order: 10, status: 'Completed' }, b: { order: 20, status: 'Not Started' }, c: { order: 30, status: 'Waiting' } };
  assert.equal(itemState(s).current.id, 'c');
  assert.equal(itemState({ a: { order: 10, status: 'Completed' }, b: { order: 20, status: 'Not Started' } }).current.id, 'b');
  assert.equal(itemState({ a: { order: 10, status: 'Completed' }, b: { order: 20, status: 'Not Applicable' } }).label, 'Completed');
  assert.equal(itemState({ a: { order: 10, status: 'Not Started' } }).label, 'Not Started');
});

test('ids are unique and time-ordered', () => {
  const ids = Array.from({ length: 500 }, pushId);
  assert.equal(new Set(ids).size, 500);
  assert.deepEqual([...ids].sort(), ids);
});
