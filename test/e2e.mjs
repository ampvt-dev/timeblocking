// End-to-end check of the real Electron app (takes about 2 minutes because it
// waits for real block transitions).
//   npm run test:e2e
// On Linux without a display: xvfb-run -a npm run test:e2e

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleSchedule } from '../src/core/sample-schedule.js';
import { fromMin, dateKey } from '../src/core/time.js';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright-core');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blockwise-e2e-'));
const dataDir = path.join(tmp, 'data');

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failed++;
};

// Today: Estimating until the next minute, then Close out for one minute.
const now = new Date();
const m = now.getHours() * 60 + now.getMinutes();
if (m + 2 >= 24 * 60) throw new Error('Run this before 11:58 PM.');
const schedule = sampleSchedule();
const today = dateKey(now);
schedule.exceptions[today] = {
  off: false,
  blocks: [
    { id: 'A', start: fromMin(Math.max(0, m - 10)), end: fromMin(m + 1), title: 'Estimating', notes: 'Heads-down', category: 'estimating' },
    { id: 'B', start: fromMin(m + 1), end: fromMin(m + 2), title: 'Close out', notes: '', category: 'buffer' },
  ],
};
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'schedule.json'), JSON.stringify(schedule));
fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ onboarded: true, warnMinutes: 0, sound: false, voice: false }));

const args = [`--user-data-dir=${tmp}`, root];
if (process.platform === 'linux') args.unshift('--no-sandbox');
const app = await _electron.launch({ executablePath: require('electron'), args });
const errors = [];
try {
  const win = await app.firstWindow();
  win.on('pageerror', (e) => errors.push(e.message));
  await app.evaluate(({ ipcMain }) => {
    globalThis.notes = [];
    ipcMain.on('notify', (_e, n) => globalThis.notes.push(n.title));
  });
  await win.waitForSelector('.now-title');
  const title = () => win.textContent('.now-title');
  const todayTitles = () => win.$$eval('.today-list li .title', (els) => els.map((e) => e.textContent).join(','));

  check((await title()) === 'Estimating', 'shows the current block');
  check((await win.textContent('.focus-note')).includes('Slack'), 'shows the category focus note');

  await win.click('.actions button:has-text("+10")');
  check((await todayTitles()) === 'Estimating', 'extending past the next block consumes it');
  await win.click('.actions button:has-text("Undo")');
  check((await todayTitles()) === 'Estimating,Close out', 'undo restores the day');

  await win.click('.actions button:has-text("Skip to next")');
  check((await title()) === 'Close out', 'skip starts the next block');
  await win.click('.actions button:has-text("Undo")');
  check((await title()) === 'Estimating', 'undo skip');

  await win.click('#mini-btn');
  await win.waitForTimeout(1500);
  const mini = app.windows().find((w) => w.url().includes('mini.html'));
  check(Boolean(mini) && (await mini.textContent('#headline')) === 'Estimating', 'mini timer shows the current block');

  const deadline = new Date(now);
  deadline.setSeconds(4, 0);
  deadline.setMinutes(now.getMinutes() + 2);
  console.log(`     waiting for block transitions until ${deadline.toLocaleTimeString()}…`);
  while (new Date() < deadline) await win.waitForTimeout(1000);
  const notes = await app.evaluate(() => globalThis.notes);
  check(notes.filter((t) => t === 'Now: Close out').length === 2, 'block start alert fired on time');
  check(notes.includes("That's the day"), 'end-of-day alert fired');
  check(await win.isVisible('.journal-editor'), 'journal opens at end of day');

  await win.click('.stars button:nth-child(4)');
  await win.fill('#j-wentWell', 'Proposals out.');
  await win.waitForTimeout(1200);
  const journal = JSON.parse(fs.readFileSync(path.join(dataDir, 'journal.json'), 'utf8'));
  check(journal.entries[today]?.rating === 4 && journal.entries[today]?.wentWell === 'Proposals out.', 'journal entry saved');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
} finally {
  const proc = app.process();
  const exited = new Promise((resolve) => proc.once('exit', resolve));
  await app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => {});
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
