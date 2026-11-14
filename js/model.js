/** Pure calculations on the data (no DOM, no database): stage lists, progress, deadlines. */
import { OPEN_STATUSES } from './config/app-config.js';
import { today, daysBetween } from './util.js';

const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
let lastTs = 0; let lastRand = [];
/** Time-ordered unique id (same scheme as Firebase push ids). */
export function pushId() {
  let now = Date.now(); const dup = now === lastTs; lastTs = now;
  const t = new Array(8); for (let i = 7; i >= 0; i--) { t[i] = PUSH_CHARS.charAt(now % 64); now = Math.floor(now / 64); }
  if (!dup) lastRand = Array.from({ length: 12 }, () => Math.floor(Math.random() * 64));
  else { let i = 11; while (i >= 0 && lastRand[i] === 63) { lastRand[i] = 0; i--; } if (i >= 0) lastRand[i]++; }
  return t.join('') + lastRand.map((n) => PUSH_CHARS.charAt(n)).join('');
}

/** Sorted array of [key, value] → [{ id: key, ...value }]. */
export const list = (obj, sort = 'order') => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v })).sort((a, b) => (a[sort] ?? 0) - (b[sort] ?? 0) || String(a.id).localeCompare(String(b.id)));

/** The stages a new item starts with, from the stage list in Settings. */
export function stagesFromTemplate(template) {
  const out = {};
  for (const t of list(template)) out[t.id] = { name: t.name, owner: t.owner || '', order: t.order, status: 'Not Started' };
  return out;
}

export const isOpen = (s) => OPEN_STATUSES.includes(s.status);
export const isDone = (s) => s.status === 'Completed';
/** Days late (> 0) for an open stage whose expected date has passed; 0 otherwise. */
export const lateDays = (s, on = today()) => (isOpen(s) && s.expEnd && s.expEnd < on ? daysBetween(s.expEnd, on) : 0);

export function dueInfo(s, soonDays = 7, on = today()) {
  if (!isOpen(s) || !s.expEnd) return null;
  const d = daysBetween(on, s.expEnd);
  if (d < 0) return { key: 'overdue', label: 'Overdue', days: -d };
  if (d === 0) return { key: 'today', label: 'Due today', days: 0 };
  if (d <= soonDays) return { key: 'soon', label: 'Due soon', days: d };
  return { key: 'upcoming', label: 'Upcoming', days: d };
}

/** Progress of a stage list: completed ÷ applicable (N/A stages do not count). */
export function progress(stages) {
  const all = Object.values(stages || {});
  const applicable = all.filter((s) => s.status !== 'Not Applicable');
  const done = applicable.filter(isDone).length;
  return { done, total: applicable.length, frac: applicable.length ? done / applicable.length : 0 };
}

/** Where an item stands: the first stage that is not finished, or "Completed". */
export function itemState(stages) {
  const ordered = list(stages);
  const p = progress(stages);
  if (p.total && p.done === p.total) return { label: 'Completed', current: null };
  const current = ordered.find((s) => isOpen(s) && s.status !== 'Not Started') || ordered.find(isOpen) || null;
  if (!p.done && !ordered.some((s) => isOpen(s) && s.status !== 'Not Started')) return { label: 'Not Started', current };
  return { label: current?.status === 'Not Started' ? 'In Progress' : current?.status || 'In Progress', current };
}
