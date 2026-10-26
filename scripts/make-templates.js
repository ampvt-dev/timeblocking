// Writes the spreadsheet templates people fill in and import:
//   templates/Blockwise-Template.xlsx  blank week with starter categories
//   templates/Blockwise-Example.xlsx   the sample week, filled in
// Run: npm run templates

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeXlsx } from '../src/main/xlsx.js';
import { scheduleToSheets } from '../src/core/grid.js';
import { normalizeSchedule } from '../src/core/schedule.js';
import { sampleSchedule } from '../src/core/sample-schedule.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'templates');

export function starterSchedule() {
  return normalizeSchedule({
    name: 'My Weekly Schedule',
    subtitle: '',
    categories: [
      { id: 'focus', name: 'Focus work', color: '#f2b774', alerts: 'full', focusNote: "Slack or text first unless it's urgent." },
      { id: 'meetings', name: 'Meetings', color: '#dbe6f4', alerts: 'full' },
      { id: 'admin', name: 'Email & admin', color: '#efefeb', alerts: 'full' },
      { id: 'clients', name: 'Clients & sales', color: '#fde6cc', alerts: 'full' },
      { id: 'people', name: 'People', color: '#e5dcf2', alerts: 'full' },
      { id: 'field', name: 'Field & site', color: '#a9dccf', alerts: 'full' },
      { id: 'breaks', name: 'Breaks', color: '#f7d7c7', alerts: 'full' },
    ],
    days: {},
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.mkdirSync(dir, { recursive: true });
  await writeXlsx(path.join(dir, 'Blockwise-Template.xlsx'), scheduleToSheets(starterSchedule(), { blank: true }));
  await writeXlsx(path.join(dir, 'Blockwise-Example.xlsx'), scheduleToSheets(sampleSchedule()));
  console.log('Templates written to templates/');
}
