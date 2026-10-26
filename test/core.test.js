import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseTimeText, formatCountdown, formatShort, toMin, startOfWeek, dateKey } from '../src/core/time.js';
import {
  findPosition, eventsBetween, extendBlock, skipBlock, validateDay, resolveDay,
  withException, normalizeSchedule, alertLevel,
} from '../src/core/schedule.js';
import { sampleSchedule } from '../src/core/sample-schedule.js';
import { sheetsToSchedule, scheduleToSheets, expandMerges } from '../src/core/grid.js';
import { parseCsv, toCsv } from '../src/core/csv.js';

const blk = (id, start, end, title = id) => ({ id, start, end, title, notes: '', category: 'general' });
const day = [blk('a', '07:30', '08:00'), blk('b', '08:00', '09:00'), blk('c', '09:00', '10:30'), blk('d', '11:00', '12:00')];

test('parseTimeText handles 12h, 24h and bare hours', () => {
  assert.deepEqual(parseTimeText('7:30'), { min: 450, explicit: false });
  assert.deepEqual(parseTimeText('1:00 PM'), { min: 780, explicit: true });
  assert.deepEqual(parseTimeText('12:00 am'), { min: 0, explicit: true });
  assert.deepEqual(parseTimeText('13:15'), { min: 795, explicit: true });
  assert.equal(parseTimeText('Lunch'), null);
});

test('countdown formatting', () => {
  assert.equal(formatCountdown(47.2), '47:12');
  assert.equal(formatCountdown(65), '1:05:00');
  assert.equal(formatShort(0.5), '<1m');
  assert.equal(formatShort(125), '2h 05m');
});

test('findPosition phases', () => {
  assert.equal(findPosition(day, 7).phase, 'before');
  assert.equal(findPosition(day, 450).current.id, 'a');
  assert.equal(findPosition(day, 480).current.id, 'b');
  const gap = findPosition(day, 640);
  assert.equal(gap.phase, 'gap');
  assert.equal(gap.next.id, 'd');
  assert.equal(findPosition(day, 721).phase, 'after');
  assert.equal(findPosition([], 600).phase, 'none');
});

test('eventsBetween fires start, warn and end once', () => {
  const ev = eventsBetween(day, 479.9, 480.1, 5);
  assert.deepEqual(ev.map((e) => `${e.type}:${e.block.id}`), ['start:b']);
  const warn = eventsBetween(day, 534.5, 535.5, 5);
  assert.deepEqual(warn.map((e) => `${e.type}:${e.block.id}`), ['warn:b']);
  assert.equal(warn[0].next.id, 'c');
  const gapEnd = eventsBetween(day, 629.5, 630.5, 5);
  assert.deepEqual(gapEnd.map((e) => e.type), ['end']);
  assert.equal(gapEnd[0].lastOfDay, false);
  const dayEnd = eventsBetween(day, 719.5, 720.5, 5);
  assert.equal(dayEnd[0].lastOfDay, true);
  assert.equal(eventsBetween(day, 480.1, 480.9, 5).length, 0);
});

test('no warning for blocks shorter than the warning window', () => {
  const short = [blk('x', '09:00', '09:05')];
  assert.equal(eventsBetween(short, 0, 1440, 5).filter((e) => e.type === 'warn').length, 0);
});

test('extendBlock takes time from following blocks', () => {
  const out = extendBlock(day, 'b', 10);
  assert.equal(out.find((b) => b.id === 'b').end, '09:10');
  assert.equal(out.find((b) => b.id === 'c').start, '09:10');
  assert.equal(out.find((b) => b.id === 'c').end, '10:30');
  // Extending past a whole block removes it.
  const big = extendBlock(day, 'a', 90);
  assert.deepEqual(big.map((b) => b.id), ['a', 'c', 'd']);
  assert.equal(big[1].start, '09:30');
  // Extending into a gap leaves the next block alone.
  const gap = extendBlock(day, 'c', 15);
  assert.equal(gap.find((b) => b.id === 'd').start, '11:00');
  assert.ok(validateDay(out).length === 0);
});

test('skipBlock ends now and starts the next block', () => {
  const out = skipBlock(day, 'b', 512.4);
  assert.equal(out.find((b) => b.id === 'b').end, '08:32');
  assert.equal(out.find((b) => b.id === 'c').start, '08:32');
  // Skipping into a gap pulls the next block forward.
  const gap = skipBlock(day, 'c', 600);
  assert.equal(gap.find((b) => b.id === 'd').start, '10:00');
  assert.ok(validateDay(out).length === 0);
});

test('validateDay reports overlaps and bad ranges', () => {
  const bad = [blk('a', '08:00', '09:00'), blk('b', '08:30', '09:30'), blk('c', '10:00', '09:00')];
  const msgs = validateDay(bad).map((p) => p.message).join(' ');
  assert.match(msgs, /Overlaps/);
  assert.match(msgs, /End must be after start/);
});

test('exceptions override the template for one date', () => {
  const s = sampleSchedule();
  const wed = new Date(2026, 9, 28); // Wednesday
  assert.equal(resolveDay(s, wed).source, 'template');
  const s2 = withException(s, wed, [blk('z', '09:00', '10:00', 'Special')]);
  const r = resolveDay(s2, wed);
  assert.equal(r.source, 'exception');
  assert.equal(r.blocks[0].title, 'Special');
  assert.equal(resolveDay(s2, new Date(2026, 10, 4)).source, 'template');
});

test('sample schedule is valid every day', () => {
  const s = sampleSchedule();
  for (const k of ['mon', 'tue', 'wed', 'thu', 'fri']) {
    assert.deepEqual(validateDay(s.days[k]), [], k);
  }
  assert.equal(s.days.fri.at(-1).end, '17:00');
  assert.equal(alertLevel(s, s.days.mon[0]), 'full');
});

test('normalizeSchedule rejects non-schedules and fixes categories', () => {
  assert.throws(() => normalizeSchedule({ foo: 1 }));
  const s = normalizeSchedule({ days: { mon: [{ start: '9:00', end: '10:00', title: 'X', category: 'nope' }] } });
  assert.equal(s.days.mon[0].start, '09:00');
  assert.equal(s.days.mon[0].category, s.categories[0].id);
});

test('spreadsheet round trip keeps blocks, notes and categories', () => {
  const s = sampleSchedule();
  const sheets = scheduleToSheets(s).map(expandMerges);
  const { schedule: back, warnings } = sheetsToSchedule(sheets);
  const catName = (sch, id) => sch.categories.find((c) => c.id === id).name;
  assert.deepEqual(warnings, []);
  for (const k of ['mon', 'tue', 'wed', 'thu', 'fri']) {
    const strip = (sch, list) => list.map(({ start, end, title, notes, category, alerts }) => ({ start, end, title, notes, category: catName(sch, category), alerts }));
    assert.deepEqual(strip(back, back.days[k]), strip(s, s.days[k]), k);
  }
  assert.equal(back.name, s.name);
  assert.equal(catName(back, back.days.mon.at(-3).category), 'Estimating (heads-down)');
  // Importing over an existing schedule keeps its category ids.
  const { schedule: again } = sheetsToSchedule(sheets, { existing: s });
  assert.equal(again.days.mon[0].category, 'coord');
});

test('grid import: repeated titles, 12h times, blank gaps, no extra sheets', () => {
  const csv = [
    'Time,Monday,Tuesday',
    '11:30,Calls,',
    '12:00,Lunch,Lunch',
    '12:30,Lunch,',
    '1:00,"Estimating\nHeads-down",Estimating',
    '1:30,Estimating,Estimating',
    '2:00,,',
  ].join('\n');
  const { schedule } = sheetsToSchedule([{ name: 'Sheet1', rows: parseCsv(csv) }]);
  const mon = schedule.days.mon.map((b) => `${b.start}-${b.end} ${b.title}${b.notes ? ` (${b.notes})` : ''}`);
  assert.deepEqual(mon, ['11:30-12:00 Calls', '12:00-13:00 Lunch', '13:00-14:00 Estimating (Heads-down)']);
  assert.deepEqual(schedule.days.tue.map((b) => `${b.start}-${b.end}`), ['12:00-12:30', '13:00-14:00']);
});

test('grid import uses Blocks and Categories sheets', () => {
  const sheets = [
    { name: 'Week', rows: [['Time', 'Mon', 'Tue'], ['9:00 AM', 'Sync', 'Sync'], ['9:30 AM', 'Deep work', 'Deep work'], ['10:00 AM', '', '']] },
    { name: 'Blocks', rows: [['Title', 'Category', 'Day', 'Notes', 'Alerts'], ['Sync', 'Meetings', '', 'Standup', 'quiet'], ['Deep work', 'Focus', 'Tue', '', ''], ['Deep work', 'Meetings', '', '', '']] },
    { name: 'Categories', rows: [['Name', 'Color', 'Alerts', 'Focus note'], ['Meetings', '#dbe6f4', 'full', ''], ['Focus', 'f2b774', 'full', 'Phone down']] },
  ];
  const { schedule } = sheetsToSchedule(sheets);
  assert.equal(schedule.days.mon[0].notes, 'Standup');
  assert.equal(schedule.days.mon[0].alerts, 'quiet');
  assert.equal(schedule.days.tue[1].category, 'focus');
  assert.equal(schedule.days.mon[1].category, 'meetings');
  assert.equal(schedule.categories.find((c) => c.id === 'focus').color, '#f2b774');
});

test('grid import reads Excel time cells', () => {
  const t = (h, m) => new Date(Date.UTC(1899, 11, 30, h, m));
  const { schedule } = sheetsToSchedule([{ name: 'Week', rows: [['Time', 'Friday'], [t(12, 0), 'Open'], [t(17, 0), '']] }]);
  assert.deepEqual(schedule.days.fri.map((b) => `${b.start}-${b.end}`), ['12:00-17:00']);
});

test('blank template has no blocks and imports cleanly', () => {
  const sheets = scheduleToSheets(sampleSchedule(), { blank: true });
  assert.equal(sheets[0].rows.length, 1 + (18 * 60 - 7 * 60) / 30 + 1);
  const { schedule } = sheetsToSchedule(sheets);
  assert.equal(Object.values(schedule.days).flat().length, 0);
});

test('csv round trip with quotes and newlines', () => {
  const rows = [['a', 'b,c'], ['he said "hi"', 'line1\nline2']];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

test('week helpers', () => {
  assert.equal(dateKey(startOfWeek(new Date(2026, 9, 26))), '2026-10-26'); // Monday
  assert.equal(dateKey(startOfWeek(new Date(2026, 10, 1))), '2026-10-26'); // Sunday
  assert.equal(toMin('24:00'), 1440);
});
