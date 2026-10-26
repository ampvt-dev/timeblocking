// Week at a glance, laid out like the printed schedule. Custom dates show
// their exception; the red line marks the current time.

import { h, textOn } from '../dom.js';
import { resolveDay, categoryOf } from '../../core/schedule.js';
import { WEEK_ORDER, DAY_NAMES, label12, toMin, startOfWeek, addDays, dateKey, dayKeyOf, minutesOfDay } from '../../core/time.js';

const PX_PER_MIN = 1.15;

let weekOffset = 0;

export function render(ctx) {
  const today = new Date();
  const monday = addDays(startOfWeek(today), weekOffset * 7);
  const dates = WEEK_ORDER.map((_, i) => addDays(monday, i));
  const resolved = dates.map((d) => ({ date: d, ...resolveDay(ctx.schedule, d) }));
  // Weekends only appear when they have something scheduled.
  const shown = resolved.filter((r, i) => i < 5 || r.blocks.length || r.source === 'exception');

  const all = shown.flatMap((r) => r.blocks);
  const from = all.length ? Math.floor(Math.min(...all.map((b) => toMin(b.start))) / 60) * 60 : 8 * 60;
  const to = all.length ? Math.ceil(Math.max(...all.map((b) => toMin(b.end))) / 30) * 30 : 17 * 60;
  const height = (to - from) * PX_PER_MIN;
  const y = (min) => (min - from) * PX_PER_MIN;

  const axis = h('div', { class: 'axis', style: { height: `${height}px` } });
  for (let t = Math.ceil(from / 60) * 60; t <= to; t += 60) {
    axis.append(h('span', { style: { top: `${y(t)}px` } }, label12(t)));
  }

  const nowLines = [];
  const columns = shown.map((r) => {
    const key = dateKey(r.date);
    const isToday = key === dateKey(today);
    const col = h('div', { class: `day-col ${isToday ? 'today' : ''}`, style: { height: `${height}px` } });
    for (const b of r.blocks) {
      const s = toMin(b.start);
      const e = toMin(b.end);
      const cat = categoryOf(ctx.schedule, b);
      const px = (e - s) * PX_PER_MIN;
      const tall = px > 44;
      col.append(h('button', {
        class: `wblock ${px < 40 ? 'short' : ''} ${cat.color.toLowerCase() === '#ffffff' ? 'outlined' : ''}`,
        style: { top: `${y(s)}px`, height: `${(e - s) * PX_PER_MIN - 3}px`, '--cat': cat.color, '--on-cat': textOn(cat.color) },
        title: `${label12(s)}–${label12(e)} ${b.title}${b.notes ? `\n${b.notes}` : ''}\n${cat.name}`,
        onClick: () => ctx.go('edit', r.source === 'exception' ? { date: key, focusId: b.id } : { day: dayKeyOf(r.date), focusId: b.id }),
      },
      h('span', { class: 'wtime' }, label12(s)),
      h('span', { class: 'wtitle' }, b.title),
      tall && b.notes ? h('span', { class: 'wnotes' }, b.notes) : null,
      ));
    }
    if (isToday) {
      const line = h('div', { class: 'now-line' });
      nowLines.push(line);
      col.append(line);
    }
    return { r, key, isToday, col };
  });

  const head = h('div', { class: 'week-head' },
    h('div', null,
      h('h1', null, ctx.schedule.name),
      ctx.schedule.subtitle ? h('div', { class: 'muted' }, ctx.schedule.subtitle) : null,
    ),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn ghost small', onClick: () => { weekOffset--; ctx.go('week'); } }, '‹ Prev'),
      h('button', { class: 'btn ghost small', onClick: () => { weekOffset = 0; ctx.go('week'); }, disabled: weekOffset === 0 }, 'This week'),
      h('button', { class: 'btn ghost small', onClick: () => { weekOffset++; ctx.go('week'); } }, 'Next ›'),
    ),
  );

  const grid = h('div', { class: 'week-grid', style: { '--cols': columns.length } },
    h('div', { class: 'axis-head' }),
    columns.map(({ r, key, isToday }) => h('div', { class: `day-head ${isToday ? 'today' : ''}` },
      h('div', { class: 'day-name' }, DAY_NAMES[dayKeyOf(r.date)].toUpperCase()),
      h('div', { class: 'day-date' },
        r.date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        r.source === 'exception' ? h('span', { class: 'pill' }, r.off ? 'off' : 'custom') : null,
      ),
      h('div', { class: 'day-links' },
        h('button', { class: 'link', onClick: () => ctx.go('edit', { day: dayKeyOf(r.date) }) }, `Every ${DAY_NAMES[dayKeyOf(r.date)].slice(0, 3)}`),
        h('button', { class: 'link', onClick: () => ctx.go('edit', { date: key }) }, 'This date'),
      ),
    )),
    axis,
    columns.map((c) => c.col),
  );

  const legend = h('div', { class: 'legend' }, ctx.schedule.categories.map((c) => h('span', { style: { '--cat': c.color } }, h('span', { class: 'swatch' }), c.name)));
  const el = h('section', { class: 'week-view' }, head, h('div', { class: 'week-scroll' }, grid), legend);

  function update(vm) {
    const m = minutesOfDay(vm.now);
    for (const line of nowLines) {
      line.style.display = m >= from && m <= to ? 'block' : 'none';
      line.style.top = `${y(m)}px`;
    }
  }
  return { el, update };
}
