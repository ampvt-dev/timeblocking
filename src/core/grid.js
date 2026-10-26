// Spreadsheet format <-> schedule.
//
// A workbook is a list of plain sheets: { name, rows: cell[][] } where a cell
// is a string, number, Date or null. Merged cells arrive already filled with
// the merged value (see src/main/xlsx.js).
//
// Sheets:
//   Week        (required) Time column + one column per day. A cell's first
//               line is the block title, any further lines are notes. A block
//               runs down consecutive cells with the same title (or a merged
//               range). Blank = free time. The last row marks the end time.
//   Blocks      (optional) Title | Category | Day | Notes | Alerts — assigns a
//               category and alert level to blocks by title (Day narrows it).
//   Categories  (optional) Name | Color | Alerts | Focus note
//   Info        (optional) Name | Subtitle as key/value rows.

import { DAY_KEYS, WEEK_ORDER, DAY_NAMES, parseTimeText, toMin, fromMin, label12 } from './time.js';
import { emptySchedule, normalizeAlerts, normalizeSchedule, paletteColor, slug, newId } from './schedule.js';

const DAY_ALIASES = {};
for (const k of DAY_KEYS) {
  const full = DAY_NAMES[k].toLowerCase();
  for (const a of [k, full, full.slice(0, 2), full.slice(0, 4)]) DAY_ALIASES[a] = k;
}
DAY_ALIASES.tues = 'tue';
DAY_ALIASES.thur = 'thu';
DAY_ALIASES.thurs = 'thu';

function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return '';
  return String(v).replace(/\r\n?/g, '\n').trim();
}

function dayFromHeader(v) {
  const t = cellText(v).toLowerCase().replace(/[^a-z]/g, '');
  return DAY_ALIASES[t] || null;
}

function cellTime(v) {
  if (v instanceof Date) return { min: v.getUTCHours() * 60 + v.getUTCMinutes(), explicit: true };
  if (typeof v === 'number' && v >= 0 && v < 1) return { min: Math.round(v * 1440), explicit: true };
  if (typeof v === 'number' && v >= 0 && v <= 24 && Number.isInteger(v)) return { min: v * 60, explicit: v > 12 };
  return parseTimeText(cellText(v));
}

function findSheet(sheets, pattern) {
  return sheets.find((s) => pattern.test(s.name.trim()));
}

function tableRows(sheet) {
  // First non-empty row is the header; returns objects keyed by lowercased header.
  if (!sheet) return [];
  const rows = sheet.rows.filter((r) => r.some((c) => cellText(c)));
  if (!rows.length) return [];
  const header = rows[0].map((c) => cellText(c).toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function pick(obj, ...keys) {
  for (const k of keys) {
    const hit = Object.keys(obj).find((h) => h === k || h.startsWith(k));
    if (hit && cellText(obj[hit])) return cellText(obj[hit]);
  }
  return '';
}

export function sheetsToSchedule(sheets, { existing } = {}) {
  const warnings = [];
  const week = findSheet(sheets, /^(week|schedule|grid)/i) || sheets[0];
  if (!week) throw new Error('The file has no sheets.');

  // Header row: the first row with at least one day name.
  const headerIndex = week.rows.findIndex((r) => r.some((c) => dayFromHeader(c)));
  if (headerIndex < 0) throw new Error(`Couldn't find a header row with day names (Monday, Tuesday, …) in "${week.name}".`);
  const header = week.rows[headerIndex];
  const dayCols = [];
  let timeCol = -1;
  header.forEach((c, i) => {
    const d = dayFromHeader(c);
    if (d) dayCols.push({ col: i, day: d });
    else if (timeCol < 0 && (/time/i.test(cellText(c)) || cellText(c) === '')) timeCol = i;
  });
  if (timeCol < 0) timeCol = 0;

  // Time slots, made monotonic: "1:00" after "12:30" means 1 PM.
  const slots = [];
  let prev = -1;
  for (let r = headerIndex + 1; r < week.rows.length; r++) {
    const t = cellTime(week.rows[r][timeCol]);
    if (!t) continue;
    let min = t.min;
    if (!t.explicit) while (min <= prev && min + 720 <= 24 * 60) min += 720;
    if (min <= prev) {
      warnings.push(`Row ${r + 1}: time ${cellText(week.rows[r][timeCol]) || min} is out of order and was skipped.`);
      continue;
    }
    slots.push({ row: r, min });
    prev = min;
  }
  if (slots.length < 2) throw new Error('Need at least two time rows (e.g. 7:30 and 8:00) in the time column.');
  const lastStep = slots[slots.length - 1].min - slots[slots.length - 2].min;
  const slotEnd = (i) => (i + 1 < slots.length ? slots[i + 1].min : Math.min(24 * 60, slots[i].min + lastStep));

  // Categories.
  const base = existing ? normalizeSchedule(existing) : emptySchedule();
  const catRows = tableRows(findSheet(sheets, /^categor/i));
  const categories = catRows.length
    ? catRows.filter((r) => pick(r, 'name', 'category')).map((r, i) => {
      const name = pick(r, 'name', 'category');
      const color = pick(r, 'color', 'colour');
      const known = base.categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
      return {
        id: known?.id || slug(name) || `cat${i}`,
        name,
        color: /^#?[0-9a-f]{6}$/i.test(color) ? `#${color.replace('#', '').toLowerCase()}` : paletteColor(i),
        alerts: normalizeAlerts(pick(r, 'alert')) || 'full',
        focusNote: pick(r, 'focus', 'note'),
      };
    })
    : base.categories.map((c) => ({ ...c }));
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const ensureCategory = (name) => {
    const key = name.toLowerCase();
    if (catByName.has(key)) return catByName.get(key).id;
    const byId = categories.find((c) => c.id === slug(name));
    if (byId) return byId.id;
    const c = { id: slug(name) || newId(), name, color: paletteColor(categories.length), alerts: 'full', focusNote: '' };
    categories.push(c);
    catByName.set(key, c);
    return c.id;
  };

  // Block attributes by title (optionally per day).
  const attrs = new Map();
  for (const r of tableRows(findSheet(sheets, /^blocks?$/i))) {
    const title = pick(r, 'title', 'block', 'name');
    if (!title) continue;
    const day = dayFromHeader(pick(r, 'day'));
    const category = pick(r, 'category');
    attrs.set(`${title.toLowerCase()}|${day || ''}`, {
      category: category ? ensureCategory(category) : null,
      notes: pick(r, 'notes', 'details', 'description'),
      alerts: normalizeAlerts(pick(r, 'alert')),
    });
  }
  // Fall back to whatever category the current schedule uses for a title.
  const existingCat = new Map();
  if (existing) {
    const idsKept = new Set(categories.map((c) => c.id));
    for (const k of DAY_KEYS) {
      for (const blk of base.days[k]) {
        if (idsKept.has(blk.category)) existingCat.set(blk.title.toLowerCase(), blk.category);
      }
    }
  }
  const defaultCat = () => categories[0]?.id || ensureCategory('General');

  const days = Object.fromEntries(DAY_KEYS.map((k) => [k, []]));
  for (const { col, day } of dayCols) {
    let cur = null;
    const close = () => { if (cur) days[day].push(cur); cur = null; };
    slots.forEach((slot, i) => {
      const text = cellText(week.rows[slot.row][col]);
      const [titleLine, ...rest] = text.split('\n');
      const title = (titleLine || '').trim();
      const notes = rest.map((l) => l.trim()).filter(Boolean).join('\n');
      if (!title) { close(); return; }
      if (cur && cur.title.toLowerCase() === title.toLowerCase() && toMin(cur.end) === slot.min) {
        cur.end = fromMin(slotEnd(i));
        if (!cur.notes && notes) cur.notes = notes;
        return;
      }
      close();
      cur = { id: newId(), start: fromMin(slot.min), end: fromMin(slotEnd(i)), title, notes };
    });
    close();
    for (const blk of days[day]) {
      const key = blk.title.toLowerCase();
      const a = attrs.get(`${key}|${day}`) || attrs.get(`${key}|`);
      blk.category = a?.category || existingCat.get(key) || defaultCat();
      if (!blk.notes && a?.notes) blk.notes = a.notes;
      if (a?.alerts) blk.alerts = a.alerts;
    }
  }
  if (!dayCols.length) warnings.push('No day columns found.');

  const info = new Map();
  for (const r of (findSheet(sheets, /^info/i)?.rows || [])) {
    if (cellText(r[0])) info.set(cellText(r[0]).toLowerCase(), cellText(r[1]));
  }

  const schedule = normalizeSchedule({
    name: info.get('name') || base.name,
    subtitle: info.get('subtitle') ?? base.subtitle,
    categories,
    days,
    exceptions: {},
  });
  return { schedule, warnings };
}

// Copy each merged range's top-left value into every cell of the range, the
// way a spreadsheet reader reports merged cells.
export function expandMerges(sheet) {
  const rows = sheet.rows.map((r) => [...r]);
  for (const [r1, c1, r2, c2] of sheet.merges || []) {
    for (let r = r1; r <= r2; r++) {
      rows[r] = rows[r] || [];
      for (let c = c1; c <= c2; c++) rows[r][c] = rows[r1][c1];
    }
  }
  return { ...sheet, rows };
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : Math.abs(a);
}

// Build a workbook spec for export. Blocks become merged, colored ranges.
export function scheduleToSheets(schedule, { blank = false, from = 7 * 60, to = 18 * 60 } = {}) {
  const days = blank ? ['mon', 'tue', 'wed', 'thu', 'fri'] : (() => {
    const used = WEEK_ORDER.filter((k) => schedule.days[k]?.length);
    return used.length ? used : ['mon', 'tue', 'wed', 'thu', 'fri'];
  })();
  const blocks = blank ? [] : days.flatMap((d) => schedule.days[d]);
  const times = blocks.flatMap((b) => [toMin(b.start), toMin(b.end)]);
  let step = 30;
  if (times.length) {
    // Largest row size (≤ 30 min) that every block boundary lands on.
    const g = times.reduce((acc, t) => gcd(acc, t), 0) || 30;
    step = 1;
    for (let d = Math.min(30, g); d >= 1; d--) if (g % d === 0) { step = d; break; }
    from = Math.floor(Math.min(...times) / step) * step;
    to = Math.max(...times);
  }
  const catById = new Map(schedule.categories.map((c) => [c.id, c]));

  const rows = [['Time', ...days.map((d) => DAY_NAMES[d])]];
  for (let t = from; t <= to; t += step) rows.push([label12(t, { meridiem: true }), ...days.map(() => '')]);
  const merges = [];
  const fills = {};
  days.forEach((d, di) => {
    const col = di + 1;
    for (const b of (blank ? [] : schedule.days[d])) {
      const r1 = 1 + (toMin(b.start) - from) / step;
      const r2 = r1 + (toMin(b.end) - toMin(b.start)) / step - 1;
      rows[r1][col] = b.notes ? `${b.title}\n${b.notes}` : b.title;
      if (r2 > r1) merges.push([r1, col, r2, col]);
      const color = catById.get(b.category)?.color;
      if (color) for (let r = r1; r <= r2; r++) fills[`${r},${col}`] = color;
    }
  });
  const weekSheet = { name: 'Week', rows, merges, fills, colWidths: [11, ...days.map(() => 30)], freeze: { row: 1, col: 1 }, headerRow: true, wrap: true, boldFirstLine: true };

  // Blocks: one row per title, or per title+day when the category differs by day.
  const blockRows = [['Title', 'Category', 'Day', 'Notes', 'Alerts']];
  if (blank) {
    // Example rows; people replace them with their own block titles.
    const cats = schedule.categories.map((c) => c.name);
    const pick = (re, fallback) => cats.find((n) => re.test(n)) || fallback;
    blockRows.push(
      ['Deep work', pick(/focus|deep|estimat/i, cats[0]), '', 'Phone on silent', ''],
      ['Team meeting', pick(/meet|coord/i, cats[0]), '', '', ''],
      ['Lunch', pick(/break|lunch|buffer/i, cats.at(-1)), '', '', ''],
    );
  } else {
    const byTitle = new Map();
    for (const d of days) {
      for (const b of schedule.days[d]) {
        const sig = `${b.category}|${b.alerts || ''}`;
        if (!byTitle.has(b.title)) byTitle.set(b.title, new Map());
        const sigs = byTitle.get(b.title);
        if (!sigs.has(sig)) sigs.set(sig, []);
        sigs.get(sig).push(d);
      }
    }
    for (const [title, sigs] of byTitle) {
      for (const [sig, ds] of sigs) {
        const [cat, alerts] = sig.split('|');
        const name = catById.get(cat)?.name || '';
        if (sigs.size === 1) blockRows.push([title, name, '', '', alerts]);
        else for (const d of ds) blockRows.push([title, name, DAY_NAMES[d], '', alerts]);
      }
    }
  }
  const blockFills = {};
  blockRows.forEach((r, i) => {
    const c = schedule.categories.find((x) => x.name === r[1]);
    if (i && c) blockFills[`${i},1`] = c.color;
  });

  const catRows = [['Name', 'Color', 'Alerts', 'Focus note']];
  const catFills = {};
  schedule.categories.forEach((c, i) => {
    catRows.push([c.name, c.color, c.alerts, c.focusNote || '']);
    catFills[`${i + 1},1`] = c.color;
  });

  const info = [['Name', schedule.name], ['Subtitle', schedule.subtitle || '']];

  const help = [
    ['How to set up your week'],
    [''],
    ['1. Week sheet: build the grid'],
    ['• Each row starts at the time in column A (30 minutes apart). The last row is the end of the day; leave its cells empty.'],
    ['• Type a block title in the cell where it starts, e.g. "Deep work" in Monday at 9:00 AM.'],
    ['• To make a block longer, merge the cells below it, or type the same title again in each cell below.'],
    ['   Excel: select the cells, then Home → Merge & Center → Merge Cells.'],
    ['   Google Sheets: select the cells, then Format → Merge cells → Merge vertically.'],
    ['• Optional notes go on a new line inside the same cell. They show under the title on the focus screen.'],
    ['   Excel for Windows: Alt+Enter.  Excel for Mac: Control+Option+Return.  Google Sheets: Ctrl+Enter (Windows) or ⌘+Enter (Mac).'],
    ['• Leave a cell empty for free time. Coloring cells is optional; colors come from the Categories sheet.'],
    ['• Need Saturday or Sunday? Add a column with that day\'s name. Delete columns for days you don\'t use.'],
    ['• Need 15-minute rows? Change the times in column A (e.g. 9:00, 9:15, 9:30). Any even interval works.'],
    ['• Times like 1:00 after 12:30 are read as PM. You can also write 1:00 PM or 13:00.'],
    [''],
    ['2. Categories sheet: kinds of blocks'],
    ['• Name, Color (hex code like #F2B774), Alerts, and an optional Focus note shown during those blocks (e.g. "Slack or text first unless urgent").'],
    ['• Alerts: full = chime + voice + notification, quiet = notification only, off = silent.'],
    [''],
    ['3. Blocks sheet: link titles to categories'],
    ['• One row per block title from the Week sheet, with its Category (pick from the dropdown).'],
    ['• Fill in Day only if the same title should use a different category on certain days.'],
    ['• Alerts here override the category for that block. Leave blank to use the category\'s setting.'],
    ['• Titles not listed here use the first category. You can change it in the app afterwards.'],
    [''],
    ['4. Info sheet: your schedule\'s name and subtitle (shown at the top of the Week view).'],
    [''],
    ['5. Import into Blockwise'],
    ['• Excel: save as .xlsx.'],
    ['• Google Sheets: File → Download → Microsoft Excel (.xlsx). Don\'t use CSV here; CSV loses merged cells and the extra sheets.'],
    ['• In Blockwise: Settings → Schedule → Import…, then pick the file. Review the summary and confirm.'],
    ['• Importing replaces your weekly template. Your journal and one-off date changes are kept.'],
  ];

  const list = (values) => `"${values.join(',')}"`;
  const blockValidations = [
    { range: [1, 1, 199, 1], list: 'Categories!$A$2:$A$60' },
    { range: [1, 2, 199, 2], list: list(WEEK_ORDER.map((d) => DAY_NAMES[d])) },
    { range: [1, 4, 199, 4], list: list(['full', 'quiet', 'off']) },
  ];

  return [
    { name: 'How to use', rows: help, colWidths: [110], wrap: true, headingRows: help.flatMap((r, i) => (/^(How to|\d\.)/.test(r[0]) ? [i] : [])) },
    weekSheet,
    { name: 'Blocks', rows: blockRows, fills: blockFills, colWidths: [28, 26, 12, 36, 10], headerRow: true, validations: blockValidations },
    { name: 'Categories', rows: catRows, fills: catFills, colWidths: [28, 12, 10, 48], headerRow: true, validations: [{ range: [1, 2, 59, 2], list: list(['full', 'quiet', 'off']) }] },
    { name: 'Info', rows: info, colWidths: [12, 80] },
  ];
}
