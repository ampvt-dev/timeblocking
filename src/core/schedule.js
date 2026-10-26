// Schedule model: a weekly template, categories, and per-date exceptions.
//
// schedule = {
//   version: 1,
//   name, subtitle,
//   categories: [{ id, name, color, alerts: 'full'|'quiet'|'off', focusNote }],
//   days: { mon: [block], tue: [...], ... },
//   exceptions: { 'YYYY-MM-DD': { off: bool, blocks: [block] } },
// }
// block = { id, start: 'HH:MM', end: 'HH:MM', title, notes, category, alerts? }
//
// block.alerts overrides the category's alert level when set.

import { DAY_KEYS, WEEK_ORDER, toMin, fromMin, dateKey, dayKeyOf } from './time.js';

export const ALERT_LEVELS = ['full', 'quiet', 'off'];
export const ALERT_LABELS = {
  full: 'Chime + voice + notification',
  quiet: 'Notification only',
  off: 'Silent',
};

const PALETTE = ['#f7d7c7', '#dbe6f4', '#f2b774', '#a9dccf', '#e5dcf2', '#efefeb', '#f6d3d3', '#d6ecc4', '#fff1a8'];

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function paletteColor(i) {
  return PALETTE[i % PALETTE.length];
}

export function emptySchedule() {
  return {
    version: 1,
    name: 'My Weekly Schedule',
    subtitle: '',
    categories: [{ id: 'general', name: 'General', color: PALETTE[0], alerts: 'full', focusNote: '' }],
    days: Object.fromEntries(DAY_KEYS.map((k) => [k, []])),
    exceptions: {},
  };
}

export function normalizeAlerts(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v || v === 'default' || v === 'inherit') return undefined;
  if (['full', 'on', 'yes', 'chime', 'all'].includes(v)) return 'full';
  if (['quiet', 'notify', 'notification', 'notification only', 'notify only'].includes(v)) return 'quiet';
  if (['off', 'silent', 'none', 'no', 'mute', 'muted'].includes(v)) return 'off';
  return undefined;
}

function normalizeBlock(raw, categoryIds, fallbackCategory) {
  const start = toMin(raw.start);
  const end = toMin(raw.end);
  const block = {
    id: raw.id ? String(raw.id) : newId(),
    start: Number.isNaN(start) ? raw.start : fromMin(start),
    end: Number.isNaN(end) ? raw.end : fromMin(end),
    title: String(raw.title ?? '').trim(),
    notes: String(raw.notes ?? '').trim(),
    category: categoryIds.has(raw.category) ? raw.category : fallbackCategory,
  };
  const alerts = normalizeAlerts(raw.alerts);
  if (alerts) block.alerts = alerts;
  return block;
}

export function sortBlocks(blocks) {
  return [...blocks].sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end));
}

// Accepts loosely-shaped input (imported JSON, older saves) and returns a
// well-formed schedule. Throws only when the input is not a schedule at all.
export function normalizeSchedule(raw) {
  if (!raw || typeof raw !== 'object' || !raw.days || typeof raw.days !== 'object') {
    throw new Error('Not a schedule file: missing "days".');
  }
  const categories = (Array.isArray(raw.categories) && raw.categories.length ? raw.categories : emptySchedule().categories)
    .map((c, i) => ({
      id: String(c.id || slug(c.name) || `cat${i}`),
      name: String(c.name || c.id || `Category ${i + 1}`),
      color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color.toLowerCase() : paletteColor(i),
      alerts: normalizeAlerts(c.alerts) || 'full',
      focusNote: String(c.focusNote ?? ''),
    }));
  const ids = new Set(categories.map((c) => c.id));
  const fallback = categories[0].id;
  const days = {};
  for (const k of DAY_KEYS) {
    const list = Array.isArray(raw.days[k]) ? raw.days[k] : [];
    days[k] = sortBlocks(list.map((b) => normalizeBlock(b, ids, fallback)));
  }
  const exceptions = {};
  for (const [key, ex] of Object.entries(raw.exceptions || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !ex) continue;
    exceptions[key] = {
      off: Boolean(ex.off),
      blocks: sortBlocks((ex.blocks || []).map((b) => normalizeBlock(b, ids, fallback))),
    };
  }
  return {
    version: 1,
    name: String(raw.name || 'My Weekly Schedule'),
    subtitle: String(raw.subtitle || ''),
    categories,
    days,
    exceptions,
  };
}

export function slug(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Returns a list of { index, message } problems; empty means the day is valid.
export function validateDay(blocks) {
  const problems = [];
  const sorted = blocks.map((b, index) => ({ b, index, s: toMin(b.start), e: toMin(b.end) }));
  for (const { b, index, s, e } of sorted) {
    if (!b.title) problems.push({ index, message: 'Needs a title.' });
    if (Number.isNaN(s) || Number.isNaN(e)) problems.push({ index, message: 'Start and end must be valid times.' });
    else if (e <= s) problems.push({ index, message: 'End must be after start.' });
  }
  const valid = sorted.filter((x) => !Number.isNaN(x.s) && !Number.isNaN(x.e) && x.e > x.s).sort((a, b) => a.s - b.s);
  for (let i = 1; i < valid.length; i++) {
    if (valid[i].s < valid[i - 1].e) {
      problems.push({
        index: valid[i].index,
        message: `Overlaps "${valid[i - 1].b.title || 'untitled'}" (${valid[i - 1].b.start}–${valid[i - 1].b.end}).`,
      });
    }
  }
  return problems;
}

// The blocks that apply on a given date: an exception if one exists, else the
// weekly template for that weekday.
export function resolveDay(schedule, date) {
  const key = dateKey(date);
  const ex = schedule.exceptions?.[key];
  if (ex) return { key, source: 'exception', off: ex.off, blocks: ex.off ? [] : ex.blocks };
  return { key, source: 'template', off: false, blocks: schedule.days[dayKeyOf(date)] || [] };
}

export function categoryOf(schedule, block) {
  return schedule.categories.find((c) => c.id === block?.category) || schedule.categories[0];
}

export function alertLevel(schedule, block) {
  return block.alerts || categoryOf(schedule, block)?.alerts || 'full';
}

// Where "now" sits in a day's blocks.
export function findPosition(blocks, nowMin) {
  let current = null;
  let next = null;
  let prev = null;
  for (const b of blocks) {
    const s = toMin(b.start);
    const e = toMin(b.end);
    if (s <= nowMin && nowMin < e) current = b;
    else if (s > nowMin && (!next || s < toMin(next.start))) next = b;
    else if (e <= nowMin && (!prev || e > toMin(prev.end))) prev = b;
  }
  let phase = 'none';
  if (blocks.length) {
    if (current) phase = 'block';
    else if (!prev) phase = 'before';
    else if (!next) phase = 'after';
    else phase = 'gap';
  }
  return { current, next, prev, phase };
}

// Alert events whose trigger time falls in (fromMin, toMin].
// start: a block begins. warn: `warnMin` minutes before a block ends.
// end: a block ends with nothing starting right after it (gap or end of day).
export function eventsBetween(blocks, fromMin, toMin_, warnMin = 0) {
  const events = [];
  const starts = new Map(blocks.map((b) => [toMin(b.start), b]));
  const inRange = (t) => fromMin < t && t <= toMin_;
  const lastEnd = Math.max(...blocks.map((b) => toMin(b.end)), -1);
  for (const b of blocks) {
    const s = toMin(b.start);
    const e = toMin(b.end);
    if (inRange(s)) events.push({ type: 'start', at: s, block: b, next: starts.get(e) || null });
    if (warnMin > 0 && e - s > warnMin && inRange(e - warnMin)) {
      events.push({ type: 'warn', at: e - warnMin, block: b, next: starts.get(e) || null });
    }
    if (inRange(e) && !starts.has(e)) {
      events.push({ type: 'end', at: e, block: b, lastOfDay: e === lastEnd });
    }
  }
  const order = { end: 0, warn: 1, start: 2 };
  return events.sort((a, b) => a.at - b.at || order[a.type] - order[b.type]);
}

// Extend a block; following blocks give up time (their starts move later and
// any block reduced to nothing is removed). The end of the day stays put
// unless the extended block was the last one.
export function extendBlock(blocks, id, minutes) {
  const list = sortBlocks(blocks).map((b) => ({ ...b }));
  const i = list.findIndex((b) => b.id === id);
  if (i < 0) return list;
  const newEnd = Math.min(24 * 60, toMin(list[i].end) + minutes);
  list[i].end = fromMin(newEnd);
  const out = list.slice(0, i + 1);
  for (const b of list.slice(i + 1)) {
    if (toMin(b.end) <= newEnd) continue; // fully consumed
    if (toMin(b.start) < newEnd) b.start = fromMin(newEnd);
    out.push(b);
  }
  return out;
}

// End a block now and start the next one immediately.
export function skipBlock(blocks, id, nowMin) {
  const list = sortBlocks(blocks).map((b) => ({ ...b }));
  const i = list.findIndex((b) => b.id === id);
  if (i < 0) return list;
  const now = Math.floor(nowMin);
  const next = list[i + 1];
  if (next && toMin(next.start) > now) next.start = fromMin(now);
  if (now <= toMin(list[i].start)) list.splice(i, 1);
  else list[i].end = fromMin(now);
  return list;
}

// Copy the current resolved day into an exception so it can be edited
// without touching the weekly template.
export function withException(schedule, date, blocks, { off = false } = {}) {
  return {
    ...schedule,
    exceptions: { ...schedule.exceptions, [dateKey(date)]: { off, blocks: sortBlocks(blocks) } },
  };
}

export function withoutException(schedule, key) {
  const exceptions = { ...schedule.exceptions };
  delete exceptions[key];
  return { ...schedule, exceptions };
}

export function cloneBlocks(blocks) {
  return blocks.map((b) => ({ ...b, id: newId() }));
}

export function activeDays(schedule) {
  return WEEK_ORDER.filter((k) => schedule.days[k]?.length);
}
