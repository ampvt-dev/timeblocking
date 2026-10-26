// Day editor for the weekly template ("every Monday") or a single date
// (an exception that leaves the template alone).

import { h, toast } from '../dom.js';
import {
  validateDay, sortBlocks, newId, withException, withoutException, cloneBlocks, ALERT_LABELS, categoryOf,
} from '../../core/schedule.js';
import { WEEK_ORDER, DAY_NAMES, toMin, fromMin, dateKey, parseDateKey, dayKeyOf, label12 } from '../../core/time.js';

let target = { type: 'template', day: WEEK_ORDER[(new Date().getDay() + 6) % 7] };
let draft = null; // { key, blocks, off }
let dirty = false;

const keyOf = (t) => (t.type === 'date' ? `date:${t.key}` : `day:${t.day}`);

function targetFromParams(params) {
  if (params.date) return { type: 'date', key: params.date };
  if (params.day) return { type: 'template', day: params.day };
  return null;
}

function loadDraft(ctx) {
  const s = ctx.schedule;
  if (target.type === 'template') {
    draft = { key: keyOf(target), blocks: structuredClone(s.days[target.day]), off: false };
  } else {
    const ex = s.exceptions[target.key];
    const tmpl = s.days[dayKeyOf(parseDateKey(target.key))];
    draft = { key: keyOf(target), blocks: structuredClone(ex ? ex.blocks : tmpl), off: Boolean(ex?.off), fromTemplate: !ex };
  }
  dirty = false;
}

function friendlyDate(key) {
  return parseDateKey(key).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function render(ctx, params) {
  const wanted = targetFromParams(params);
  if (wanted && keyOf(wanted) !== keyOf(target)) {
    target = wanted;
    draft = null;
  }
  if (!draft || draft.key !== keyOf(target)) loadDraft(ctx);

  const s = ctx.schedule;
  const el = h('section', { class: 'edit-view' });
  const markDirty = () => { dirty = true; saveBtn.disabled = false; discardBtn.disabled = false; };

  // ----- target picker -----
  const todayKey = dateKey(new Date());
  const upcoming = Object.keys(s.exceptions).filter((k) => k >= todayKey).sort();
  el.append(h('div', { class: 'edit-targets card' },
    h('div', { class: 'target-group' },
      h('div', { class: 'eyebrow' }, 'Weekly template'),
      h('div', { class: 'seg' }, WEEK_ORDER.map((d) => h('button', {
        class: target.type === 'template' && target.day === d ? 'active' : '',
        onClick: () => ctx.go('edit', { day: d }),
      }, DAY_NAMES[d].slice(0, 3), h('small', null, s.days[d].length || '')))),
    ),
    h('div', { class: 'target-group' },
      h('div', { class: 'eyebrow' }, 'One specific date'),
      h('div', { class: 'row gap' },
        h('input', {
          type: 'date',
          value: target.type === 'date' ? target.key : '',
          onChange: (e) => e.target.value && ctx.go('edit', { date: e.target.value }),
        }),
        h('button', { class: `btn small ${target.type === 'date' && target.key === todayKey ? 'active' : ''}`, onClick: () => ctx.go('edit', { date: todayKey }) }, 'Today'),
        upcoming.filter((k) => k !== todayKey).slice(0, 6).map((k) => h('button', {
          class: `btn small ghost ${target.type === 'date' && target.key === k ? 'active' : ''}`,
          onClick: () => ctx.go('edit', { date: k }),
          title: 'Custom date',
        }, parseDateKey(k).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))),
      ),
    ),
  ));

  // ----- heading -----
  const heading = target.type === 'template'
    ? h('div', { class: 'edit-heading' },
      h('h1', null, `Every ${DAY_NAMES[target.day]}`),
      h('p', { class: 'muted' }, 'Changes apply to every week. To change just one day, pick a date instead.'))
    : h('div', { class: 'edit-heading' },
      h('h1', null, friendlyDate(target.key)),
      h('p', { class: 'muted' }, draft.fromTemplate
        ? `Follows the ${DAY_NAMES[dayKeyOf(parseDateKey(target.key))]} template. Saving creates a custom version for this date only.`
        : 'Custom for this date only. The weekly template is unchanged.'),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: draft.off, onChange: (e) => { draft.off = e.target.checked; markDirty(); rows.classList.toggle('disabled', draft.off); } }),
        'Day off (no blocks or alerts)'),
    );
  el.append(heading);

  // ----- rows -----
  const rows = h('div', { class: `edit-rows ${draft.off ? 'disabled' : ''}` });
  const msgEls = [];

  function validate() {
    const problems = validateDay(draft.blocks);
    msgEls.forEach((m, i) => {
      const mine = problems.filter((p) => p.index === i).map((p) => p.message);
      m.textContent = mine.join(' ');
      m.parentElement.classList.toggle('invalid', mine.length > 0);
    });
    return problems;
  }

  function rowEl(b, i) {
    const msg = h('div', { class: 'row-msg' });
    msgEls[i] = msg;
    const set = (field) => (e) => {
      b[field] = e.target.value;
      if (field === 'alerts' && !e.target.value) delete b.alerts;
      markDirty();
      validate();
      if (field === 'category') row.style.setProperty('--cat', categoryOf(s, b).color);
    };
    const row = h('div', { class: `edit-row ${params.focusId === b.id ? 'focus' : ''}`, style: { '--cat': categoryOf(s, b).color }, 'data-id': b.id },
      h('div', { class: 'edit-line' },
        h('span', { class: 'swatch' }),
        h('input', { type: 'time', step: 300, value: b.start, onChange: set('start'), 'aria-label': 'Start' }),
        h('span', { class: 'muted' }, '–'),
        h('input', { type: 'time', step: 300, value: b.end, onChange: set('end'), 'aria-label': 'End' }),
        h('input', { class: 'title-input', type: 'text', value: b.title, placeholder: 'Block title', onInput: set('title'), 'aria-label': 'Title' }),
        h('select', { onChange: set('category'), 'aria-label': 'Category' },
          s.categories.map((c) => h('option', { value: c.id, selected: c.id === b.category }, c.name))),
        h('select', { onChange: set('alerts'), 'aria-label': 'Alerts', title: 'Alerts for this block' },
          h('option', { value: '', selected: !b.alerts }, 'Alerts: category default'),
          Object.entries(ALERT_LABELS).map(([v, l]) => h('option', { value: v, selected: b.alerts === v }, `Alerts: ${l.toLowerCase()}`))),
        h('button', { class: 'icon-btn', title: 'Delete block', onClick: () => { draft.blocks.splice(i, 1); markDirty(); renderRows(); } }, '✕'),
      ),
      h('textarea', { rows: Math.min(4, Math.max(1, (b.notes || '').split('\n').length)), placeholder: 'Notes (optional) — shown on the focus screen', value: b.notes || '', onInput: set('notes') }),
      msg,
    );
    return row;
  }

  function renderRows() {
    rows.replaceChildren();
    msgEls.length = 0;
    draft.blocks.forEach((b, i) => rows.append(rowEl(b, i)));
    if (!draft.blocks.length) rows.append(h('p', { class: 'empty muted' }, 'No blocks yet.'));
    validate();
  }
  renderRows();
  el.append(rows);

  // ----- tools -----
  const copySources = [
    ...WEEK_ORDER.filter((d) => !(target.type === 'template' && d === target.day)).map((d) => ({ label: `${DAY_NAMES[d]} template`, blocks: () => s.days[d] })),
  ];
  el.append(h('div', { class: 'edit-tools row gap' },
    h('button', {
      class: 'btn',
      onClick: () => {
        const last = sortBlocks(draft.blocks).at(-1);
        const start = last ? toMin(last.end) : 9 * 60;
        draft.blocks.push({ id: newId(), start: fromMin(start), end: fromMin(Math.min(24 * 60, start + 30)), title: '', notes: '', category: last?.category || s.categories[0].id });
        markDirty();
        renderRows();
        rows.querySelector('.edit-row:last-child .title-input')?.focus();
      },
    }, '+ Add block'),
    h('select', {
      onChange: (e) => {
        const src = copySources[Number(e.target.value)];
        e.target.value = '';
        if (!src) return;
        if (draft.blocks.length && !confirm(`Replace these blocks with a copy of the ${src.label}?`)) return;
        draft.blocks = cloneBlocks(src.blocks());
        markDirty();
        renderRows();
      },
    }, h('option', { value: '' }, 'Copy from…'), copySources.map((c, i) => h('option', { value: i }, c.label))),
    h('button', { class: 'btn ghost', onClick: () => { if (confirm('Remove all blocks from this day?')) { draft.blocks = []; markDirty(); renderRows(); } } }, 'Clear day'),
  ));

  // ----- save bar -----
  const saveBtn = h('button', {
    class: 'btn primary',
    disabled: !dirty,
    onClick: () => {
      const problems = draft.off ? [] : validate();
      if (problems.length) {
        toast(`Fix ${problems.length} problem${problems.length === 1 ? '' : 's'} before saving.`);
        return;
      }
      const blocks = sortBlocks(draft.blocks);
      if (target.type === 'template') {
        ctx.setSchedule({ ...s, days: { ...s.days, [target.day]: blocks } }, { render: false });
        toast(`Saved every ${DAY_NAMES[target.day]}.`);
      } else {
        ctx.setSchedule(withException(s, parseDateKey(target.key), blocks, { off: draft.off }), { render: false });
        toast(`Saved ${friendlyDate(target.key)}.`);
      }
      draft = null;
      dirty = false;
      ctx.go('edit', target.type === 'date' ? { date: target.key } : { day: target.day });
    },
  }, 'Save');
  const discardBtn = h('button', { class: 'btn ghost', disabled: !dirty, onClick: () => { draft = null; dirty = false; ctx.go('edit', target.type === 'date' ? { date: target.key } : { day: target.day }); } }, 'Discard changes');
  const revertBtn = target.type === 'date' && s.exceptions[target.key]
    ? h('button', {
      class: 'btn ghost danger',
      onClick: () => {
        if (!confirm('Remove the custom version of this date and go back to the weekly template?')) return;
        ctx.setSchedule(withoutException(s, target.key), { render: false });
        draft = null;
        dirty = false;
        ctx.go('edit', { date: target.key });
      },
    }, 'Revert to template')
    : null;
  el.append(h('div', { class: 'save-bar' }, saveBtn, discardBtn, revertBtn,
    h('span', { class: 'muted small' }, draft.blocks.length ? `${draft.blocks.length} blocks · ${label12(Math.min(...draft.blocks.map((b) => toMin(b.start)).filter(Number.isFinite)))}–${label12(Math.max(...draft.blocks.map((b) => toMin(b.end)).filter(Number.isFinite)))}` : '')));

  if (params.focusId) {
    requestAnimationFrame(() => rows.querySelector('.edit-row.focus')?.scrollIntoView({ block: 'center' }));
  }

  return {
    el,
    canLeave() {
      if (!dirty) return true;
      if (!confirm('You have unsaved changes. Discard them?')) return false;
      draft = null;
      dirty = false;
      return true;
    },
  };
}
