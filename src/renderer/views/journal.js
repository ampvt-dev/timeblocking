// End-of-day journal: a 1–5 star rating, what went well, what didn't, notes.
// Extensions and skips made that day are listed automatically.

import { h, toast } from '../dom.js';
import { toCsv } from '../../core/csv.js';
import { dateKey, parseDateKey, label12, toMin } from '../../core/time.js';

const FIELDS = [
  ['wentWell', 'What went well?'],
  ['didntGoWell', "What didn't go well?"],
  ['notes', 'Notes for tomorrow'],
];

const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');

function friendly(key, opts = { weekday: 'long', month: 'long', day: 'numeric' }) {
  return parseDateKey(key).toLocaleDateString([], opts);
}

let selected = null;

export function render(ctx, params) {
  const todayKey = dateKey(new Date());
  if (params.key) selected = params.key;
  if (!selected) selected = todayKey;
  const key = selected;
  const entries = ctx.journal.entries;
  const entry = { rating: 0, wentWell: '', didntGoWell: '', notes: '', ...(entries[key] || {}) };
  const log = ctx.journal.logs[key] || [];

  // ----- list -----
  const keys = [...new Set([todayKey, ...Object.keys(entries)])].sort().reverse();
  const list = h('div', { class: 'journal-list card' },
    h('div', { class: 'row space' },
      h('div', { class: 'eyebrow' }, 'Entries'),
      h('button', { class: 'link', onClick: () => exportCsv(ctx) }, 'Export CSV'),
    ),
    h('ul', null, keys.map((k) => {
      const e = entries[k];
      return h('li', null, h('button', {
        class: k === key ? 'active' : '',
        onClick: () => ctx.go('journal', { key: k }),
      },
      h('span', { class: 'jl-date' }, k === todayKey ? 'Today' : friendly(k, { weekday: 'short', month: 'short', day: 'numeric' })),
      h('span', { class: 'jl-stars' }, e?.rating ? stars(e.rating) : e ? '' : 'not written'),
      e?.wentWell ? h('span', { class: 'jl-snippet' }, e.wentWell.split('\n')[0]) : null,
      ));
    })),
  );

  // ----- editor -----
  const status = h('span', { class: 'muted small' });
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ctx.setJournalEntry(key, entry);
      status.textContent = 'Saved';
      starRow.closest('.journal-view')?.querySelector('.journal-list li button.active .jl-stars')?.replaceChildren(stars(entry.rating));
    }, 400);
    status.textContent = 'Saving…';
  };

  const starRow = h('div', { class: 'stars', role: 'radiogroup', 'aria-label': 'Rate the day' });
  const paintStars = () => {
    starRow.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', {
      class: n <= entry.rating ? 'on' : '',
      role: 'radio',
      'aria-checked': String(n === entry.rating),
      title: ['Rough day', 'Meh', 'OK', 'Good', 'Great day'][n - 1],
      onClick: () => { entry.rating = entry.rating === n ? 0 : n; paintStars(); save(); },
    }, '★')));
  };
  paintStars();

  const editor = h('div', { class: 'journal-editor card' },
    h('div', { class: 'eyebrow' }, key === todayKey ? 'Today' : 'Journal'),
    h('h1', null, friendly(key)),
    h('div', { class: 'field' }, h('label', null, 'How was the day?'), starRow),
    FIELDS.map(([field, label]) => h('div', { class: 'field' },
      h('label', { for: `j-${field}` }, label),
      h('textarea', {
        id: `j-${field}`,
        rows: 4,
        value: entry[field] || '',
        onInput: (e) => { entry[field] = e.target.value; save(); },
      }),
    )),
    log.length ? h('div', { class: 'field' },
      h('label', null, 'Schedule changes today'),
      h('ul', { class: 'log' }, log.map((l) => h('li', null, h('span', { class: 'muted' }, label12(toMin(l.at))), ' ', l.text))),
    ) : null,
    h('div', { class: 'row space' }, status,
      entries[key] ? h('button', {
        class: 'link danger',
        onClick: () => {
          if (!confirm('Delete this journal entry?')) return;
          const rest = { ...ctx.journal.entries };
          delete rest[key];
          ctx.replaceJournal({ ...ctx.journal, entries: rest });
          ctx.go('journal', { key });
        },
      }, 'Delete entry') : null,
    ),
  );

  const el = h('section', { class: 'journal-view' }, list, editor);
  requestAnimationFrame(() => { if (key === todayKey && !entries[key]) editor.querySelector('textarea')?.focus(); });
  return { el };
}

async function exportCsv(ctx) {
  const { entries, logs } = ctx.journal;
  const rows = [['Date', 'Rating', 'What went well', "What didn't go well", 'Notes', 'Schedule changes']];
  for (const k of Object.keys(entries).sort()) {
    const e = entries[k];
    rows.push([k, e.rating || '', e.wentWell || '', e.didntGoWell || '', e.notes || '', (logs[k] || []).map((l) => `${l.at} ${l.text}`).join('\n')]);
  }
  const path = await ctx.api.exportFile({ format: 'csv', defaultName: `journal-${dateKey(new Date())}.csv`, text: toCsv(rows) });
  if (path) toast(`Exported to ${path}`);
}
