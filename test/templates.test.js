// The committed spreadsheet templates must import cleanly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from '../src/main/xlsx.js';
import { sheetsToSchedule } from '../src/core/grid.js';
import { sampleSchedule } from '../src/core/sample-schedule.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

test('blank template imports with no blocks and the starter categories', async () => {
  const { schedule, warnings } = sheetsToSchedule(await readXlsx(path.join(dir, 'Blockwise-Template.xlsx')));
  assert.deepEqual(warnings, []);
  assert.equal(Object.values(schedule.days).flat().length, 0);
  assert.deepEqual(schedule.categories.map((c) => c.name), ['Focus work', 'Meetings', 'Email & admin', 'Clients & sales', 'People', 'Field & site', 'Breaks']);
  assert.equal(schedule.name, 'My Weekly Schedule');
});

test('example template reproduces the sample week', async () => {
  const { schedule, warnings } = sheetsToSchedule(await readXlsx(path.join(dir, 'Blockwise-Example.xlsx')));
  assert.deepEqual(warnings, []);
  const sample = sampleSchedule();
  const strip = (s, d) => s.days[d].map((b) => `${b.start}-${b.end} ${b.title}|${b.notes}|${s.categories.find((c) => c.id === b.category).name}`);
  for (const d of ['mon', 'tue', 'wed', 'thu', 'fri']) assert.deepEqual(strip(schedule, d), strip(sample, d), d);
});

test('filling in the blank template works like a person would', async () => {
  const sheets = await readXlsx(path.join(dir, 'Blockwise-Template.xlsx'));
  const week = sheets.find((s) => s.name === 'Week');
  const row = (label) => week.rows.findIndex((r) => r[0] === label);
  // Deep work Monday 9:00–11:00 by repeating the title; notes on a second line.
  week.rows[row('9:00 AM')][1] = 'Deep work\nQuotes and bids';
  for (const t of ['9:30 AM', '10:00 AM', '10:30 AM']) week.rows[row(t)][1] = 'Deep work';
  week.rows[row('12:00 PM')][1] = 'Lunch';
  const { schedule } = sheetsToSchedule(sheets);
  assert.deepEqual(schedule.days.mon.map((b) => `${b.start}-${b.end} ${b.title}`), ['09:00-11:00 Deep work', '12:00-12:30 Lunch']);
  assert.equal(schedule.days.mon[0].notes, 'Quotes and bids');
  assert.equal(schedule.categories.find((c) => c.id === schedule.days.mon[0].category).name, 'Focus work');
  assert.equal(schedule.categories.find((c) => c.id === schedule.days.mon[1].category).name, 'Breaks');
});
