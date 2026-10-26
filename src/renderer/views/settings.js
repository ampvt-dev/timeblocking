// Alerts, voice, app behavior, categories, and schedule import/export.

import { h, toast } from '../dom.js';
import { listVoices, onVoicesChanged } from '../sounds.js';
import { ALERT_LABELS, normalizeSchedule, emptySchedule, slug, newId, paletteColor } from '../../core/schedule.js';
import { sheetsToSchedule, scheduleToSheets } from '../../core/grid.js';
import { sampleSchedule } from '../../core/sample-schedule.js';
import { DAY_KEYS, DAY_NAMES, WEEK_ORDER, dateKey } from '../../core/time.js';

const check = (ctx, key, label, hint) => h('label', { class: 'check' },
  h('input', { type: 'checkbox', checked: Boolean(ctx.settings[key]), onChange: (e) => ctx.setSettings({ [key]: e.target.checked }) }),
  h('span', null, label, hint ? h('small', { class: 'muted block' }, hint) : null));

function section(title, ...children) {
  return h('section', { class: 'card settings-section' }, h('h2', null, title), ...children);
}

function summary(schedule) {
  const parts = WEEK_ORDER.filter((d) => schedule.days[d].length).map((d) => `${DAY_NAMES[d].slice(0, 3)} ${schedule.days[d].length}`);
  return parts.length ? `${parts.join(', ')} blocks` : 'no blocks';
}

async function doImport(ctx) {
  let res;
  try {
    res = await ctx.api.importFile();
  } catch (e) {
    toast(`Couldn't read that file: ${e.message}`);
    return;
  }
  if (!res) return;
  try {
    if (res.kind === 'json' && res.json?.schedule) {
      // Full backup.
      const schedule = normalizeSchedule(res.json.schedule);
      if (!confirm(`Restore backup "${res.fileName}"?\n\nThis replaces your schedule (${summary(schedule)}), custom dates and journal.`)) return;
      ctx.replaceJournal(res.json.journal || {});
      if (res.json.settings) ctx.setSettings({ ...res.json.settings, onboarded: true });
      ctx.setSchedule(schedule);
      toast('Backup restored.');
      return;
    }
    let schedule;
    let warnings = [];
    if (res.kind === 'json') schedule = normalizeSchedule(res.json);
    else ({ schedule, warnings } = sheetsToSchedule(res.sheets, { existing: ctx.schedule }));
    const msg = [
      `Import "${res.fileName}"?`,
      '',
      `Found ${summary(schedule)} and ${schedule.categories.length} categories.`,
      warnings.length ? `\nNotes:\n• ${warnings.slice(0, 6).join('\n• ')}` : '',
      '',
      'This replaces your weekly template. Your journal and custom dates are kept.',
    ].join('\n');
    if (!confirm(msg)) return;
    ctx.setSettings({ onboarded: true });
    ctx.setSchedule({ ...schedule, exceptions: { ...ctx.schedule.exceptions, ...schedule.exceptions } });
    toast('Schedule imported.');
  } catch (e) {
    toast(`Import failed: ${e.message}`, { ms: 9000 });
  }
}

async function exportSheet(ctx, blank) {
  const name = blank ? 'timeblock-template.xlsx' : `${slug(ctx.schedule.name) || 'schedule'}.xlsx`;
  const path = await ctx.api.exportFile({ format: 'xlsx', defaultName: name, sheets: scheduleToSheets(ctx.schedule, { blank }) });
  if (path) toast(`Saved ${path}`);
}

async function backup(ctx) {
  const data = { app: 'timeblock', exportedAt: new Date().toISOString(), schedule: ctx.schedule, journal: ctx.journal, settings: ctx.settings };
  const path = await ctx.api.exportFile({ format: 'json', defaultName: `timeblock-backup-${dateKey(new Date())}.json`, text: JSON.stringify(data, null, 2) });
  if (path) toast(`Saved ${path}`);
}

function categoriesSection(ctx) {
  const s = ctx.schedule;
  const used = new Set([...DAY_KEYS.flatMap((d) => s.days[d]), ...Object.values(s.exceptions).flatMap((e) => e.blocks)].map((b) => b.category));
  const update = (id, patch, render = false) => ctx.setSchedule({ ...ctx.schedule, categories: ctx.schedule.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) }, { render });
  const table = h('div', { class: 'cat-table' },
    h('div', { class: 'cat-row head' }, h('span', null, 'Color'), h('span', null, 'Name'), h('span', null, 'Alerts'), h('span', null, 'Focus note (shown during these blocks)'), h('span')),
    s.categories.map((c) => h('div', { class: 'cat-row' },
      h('input', { type: 'color', value: c.color, onChange: (e) => update(c.id, { color: e.target.value }) }),
      h('input', { type: 'text', value: c.name, onChange: (e) => update(c.id, { name: e.target.value || c.name }) }),
      h('select', { onChange: (e) => update(c.id, { alerts: e.target.value }) },
        Object.entries(ALERT_LABELS).map(([v, l]) => h('option', { value: v, selected: c.alerts === v }, l))),
      h('input', { type: 'text', value: c.focusNote || '', placeholder: 'e.g. Slack or text first unless urgent', onChange: (e) => update(c.id, { focusNote: e.target.value }) }),
      h('button', {
        class: 'icon-btn',
        disabled: used.has(c.id) || s.categories.length === 1,
        title: used.has(c.id) ? 'In use by some blocks' : 'Delete category',
        onClick: () => ctx.setSchedule({ ...ctx.schedule, categories: ctx.schedule.categories.filter((x) => x.id !== c.id) }),
      }, '✕'),
    )),
  );
  return section('Categories',
    h('p', { class: 'muted' }, 'Colors and default alert level for each kind of block. Individual blocks can override alerts in the editor.'),
    table,
    h('button', {
      class: 'btn',
      onClick: () => ctx.setSchedule({ ...ctx.schedule, categories: [...ctx.schedule.categories, { id: newId(), name: 'New category', color: paletteColor(s.categories.length), alerts: 'full', focusNote: '' }] }),
    }, '+ Add category'),
  );
}

export function render(ctx, params) {
  const st = ctx.settings;
  const el = h('section', { class: 'settings-view' });

  // ----- alerts -----
  const voiceSelect = h('select', { onChange: (e) => ctx.setSettings({ voiceName: e.target.value }) });
  const fillVoices = () => {
    const voices = listVoices();
    voiceSelect.replaceChildren(
      h('option', { value: '', selected: !st.voiceName }, 'System default'),
      ...voices.map((v) => h('option', { value: v.name, selected: v.name === ctx.settings.voiceName }, `${v.name}${v.lang ? ` (${v.lang})` : ''}`)),
    );
  };
  fillVoices();
  onVoicesChanged(fillVoices);

  el.append(section('Alerts',
    h('div', { class: 'grid2' },
      h('div', null,
        check(ctx, 'sound', 'Chime', 'Rising chime when a block starts, single tone before it ends, falling chime when a block ends with a break after it.'),
        check(ctx, 'voice', 'Voice announcement', 'Speaks the block name and end time.'),
        check(ctx, 'speakNotes', 'Read the first line of notes aloud'),
        check(ctx, 'notifications', 'Desktop notifications'),
      ),
      h('div', null,
        h('label', { class: 'field' }, h('span', null, 'Heads-up before a block ends'),
          h('select', { onChange: (e) => ctx.setSettings({ warnMinutes: Number(e.target.value) }) },
            [0, 1, 2, 3, 5, 10, 15].map((m) => h('option', { value: m, selected: st.warnMinutes === m }, m ? `${m} minutes` : 'Off')))),
        h('label', { class: 'field' }, h('span', null, 'Volume'),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st.volume, onChange: (e) => ctx.setSettings({ volume: Number(e.target.value) }) })),
        h('label', { class: 'field' }, h('span', null, 'Voice'), voiceSelect),
        h('label', { class: 'field' }, h('span', null, 'Speaking speed'),
          h('input', { type: 'range', min: 0.6, max: 1.6, step: 0.05, value: st.voiceRate, onChange: (e) => ctx.setSettings({ voiceRate: Number(e.target.value) }) })),
      ),
    ),
    h('div', { class: 'row gap wrap' },
      h('span', { class: 'muted small' }, 'Test:'),
      h('button', { class: 'btn small', onClick: () => ctx.testAlert('start') }, 'Block start'),
      h('button', { class: 'btn small', onClick: () => ctx.testAlert('warn') }, 'Heads-up'),
      h('button', { class: 'btn small', onClick: () => ctx.testAlert('dayEnd') }, 'End of day'),
      h('button', { class: 'btn small', onClick: () => ctx.testAlert('voice') }, 'Voice only'),
      h('button', { class: 'btn small', onClick: () => ctx.testAlert('notification') }, 'Notification'),
    ),
  ));

  // ----- app -----
  const loginBox = h('input', {
    type: 'checkbox',
    onChange: async (e) => { e.target.checked = await ctx.api.setOpenAtLogin(e.target.checked); },
  });
  const dataPath = h('code', { class: 'small' });
  ctx.api.info().then((info) => {
    loginBox.checked = info.openAtLogin;
    dataPath.textContent = info.dataDir;
  });
  el.append(section('App',
    h('label', { class: 'check' }, loginBox, h('span', null, 'Start Timeblock when I log in', h('small', { class: 'muted block' }, 'Starts hidden in the menu bar / tray.'))),
    check(ctx, 'menuBarCountdown', 'Show the current block and time left in the menu bar (Mac)', 'On Windows, hover the tray icon or use the Mini timer.'),
    check(ctx, 'journalPrompt', 'Open the journal when the last block of the day ends'),
  ));

  el.append(categoriesSection(ctx));

  // ----- schedule -----
  const s = ctx.schedule;
  const scheduleSection = section('Schedule',
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', null, 'Name'),
        h('input', { type: 'text', value: s.name, onChange: (e) => ctx.setSchedule({ ...ctx.schedule, name: e.target.value }, { render: false }) })),
      h('label', { class: 'field' }, h('span', null, 'Subtitle'),
        h('input', { type: 'text', value: s.subtitle, placeholder: 'e.g. Mornings: coordination · Afternoons: estimating', onChange: (e) => ctx.setSchedule({ ...ctx.schedule, subtitle: e.target.value }, { render: false }) })),
    ),
    h('p', { class: 'muted' }, 'Share your week or build one in Excel / Google Sheets: export a spreadsheet, edit the 30-minute grid, then import it. Instructions are in the file.'),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn primary', onClick: () => doImport(ctx) }, 'Import… (.xlsx, .csv, .json)'),
      h('button', { class: 'btn', onClick: () => exportSheet(ctx, false) }, 'Export my week (.xlsx)'),
      h('button', { class: 'btn', onClick: () => exportSheet(ctx, true) }, 'Blank template (.xlsx)'),
      h('button', { class: 'btn', onClick: () => backup(ctx) }, 'Back up everything (.json)'),
    ),
    h('div', { class: 'row gap wrap danger-zone' },
      h('button', {
        class: 'btn ghost',
        onClick: () => {
          if (confirm('Replace your weekly template with the sample week? Your journal is kept.')) ctx.setSchedule({ ...sampleSchedule(), exceptions: ctx.schedule.exceptions });
        },
      }, 'Load sample week'),
      h('button', {
        class: 'btn ghost danger',
        onClick: () => {
          if (confirm('Start from an empty week? Your categories and journal are kept.')) ctx.setSchedule({ ...emptySchedule(), name: ctx.schedule.name, categories: ctx.schedule.categories });
        },
      }, 'Start from scratch'),
    ),
    h('p', { class: 'muted small' }, 'Data folder: ', dataPath, ' ', h('button', { class: 'link', onClick: () => ctx.api.openDataFolder() }, 'Open')),
  );
  scheduleSection.id = 'schedule';
  el.append(scheduleSection);

  if (params.focus === 'schedule') requestAnimationFrame(() => scheduleSection.scrollIntoView({ block: 'start' }));
  return { el };
}
