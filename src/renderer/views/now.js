// Focus screen: the current block, a countdown, extend/skip, and today's list.

import { h, textOn } from '../dom.js';
import { categoryOf, withoutException } from '../../core/schedule.js';
import { label12, toMin, formatCountdown, formatShort, DAY_NAMES, dayKeyOf, dateKey } from '../../core/time.js';

const range = (b) => `${label12(toMin(b.start))} – ${label12(toMin(b.end))}`;

function welcome(ctx) {
  const done = () => ctx.setSettings({ onboarded: true }, { render: true });
  return h('div', { class: 'welcome card' },
    h('h2', null, 'Welcome to Timeblock'),
    h('p', null, 'It shows the block you should be in, counts it down, and chimes, speaks and notifies when it\'s time to switch. Close the window and it keeps running in the menu bar (Mac) or system tray (Windows).'),
    h('p', null, `It's loaded with a sample week ("${ctx.schedule.name}"). Keep it, or bring your own:`),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn primary', onClick: done }, 'Use this schedule'),
      h('button', { class: 'btn', onClick: () => { done(); ctx.go('settings', { focus: 'schedule' }); } }, 'Import a spreadsheet…'),
      h('button', {
        class: 'btn',
        onClick: () => { done(); ctx.go('edit'); },
      }, 'Build it in the editor'),
    ),
  );
}

function todayList(ctx, vm) {
  const nowMin = vm.nowMin;
  return h('ol', { class: 'today-list' }, vm.day.blocks.map((b) => {
    const cat = categoryOf(ctx.schedule, b);
    const past = toMin(b.end) <= nowMin;
    const isCur = vm.current?.id === b.id;
    return h('li', { class: `${past ? 'past' : ''} ${isCur ? 'current' : ''}`, style: { '--cat': cat.color } },
      h('span', { class: 'swatch' }),
      h('span', { class: 'time' }, label12(toMin(b.start))),
      h('span', { class: 'title' }, b.title),
      isCur ? h('span', { class: 'pill' }, 'now') : null,
    );
  }));
}

export function render(ctx) {
  const vm = ctx.vm;
  const el = h('section', { class: 'now-view' });
  if (!vm) return { el };
  if (!ctx.settings.onboarded) el.append(welcome(ctx));

  const dayName = DAY_NAMES[dayKeyOf(vm.now)];
  const custom = vm.day.source === 'exception';
  const header = h('div', { class: 'now-header' },
    h('div', null,
      h('div', { class: 'eyebrow' }, `${dayName} · ${vm.now.toLocaleDateString([], { month: 'long', day: 'numeric' })}`),
      h('div', { class: 'muted' }, ctx.schedule.name),
    ),
    custom ? h('div', { class: 'custom-badge' },
      vm.day.off ? 'Day off' : 'Today is customized',
      h('button', {
        class: 'link',
        onClick: () => {
          if (confirm("Revert today to the weekly template? Today's extensions, skips and edits will be removed.")) {
            ctx.setSchedule(withoutException(ctx.schedule, dateKey(vm.now)));
          }
        },
      }, 'Revert to template'),
      h('button', { class: 'link', onClick: () => ctx.go('edit', { date: dateKey(vm.now) }) }, 'Edit today'),
    ) : h('button', { class: 'btn ghost small', onClick: () => ctx.go('edit', { date: dateKey(vm.now) }) }, 'Change today only…'),
  );
  el.append(header);

  const refs = {};
  const layout = h('div', { class: 'now-layout' });
  const main = h('div', { class: 'now-main' });
  layout.append(main);

  if (vm.current) {
    const b = vm.current;
    const cat = categoryOf(ctx.schedule, b);
    refs.countdown = h('div', { class: 'countdown', 'aria-live': 'off' });
    refs.bar = h('div', { class: 'bar' });
    refs.sub = h('div', { class: 'countdown-sub' });
    main.append(h('div', { class: 'now-card', style: { '--cat': cat.color, '--on-cat': textOn(cat.color) } },
      h('div', { class: 'now-band' },
        h('span', { class: 'eyebrow' }, 'Now'),
        h('span', null, range(b)),
        h('span', { class: 'cat-name' }, cat.name),
      ),
      h('div', { class: 'now-body' },
        h('h1', { class: 'now-title' }, b.title),
        b.notes ? h('p', { class: 'now-notes' }, b.notes) : null,
        cat.focusNote ? h('div', { class: 'focus-note' }, cat.focusNote) : null,
        refs.countdown,
        refs.sub,
        h('div', { class: 'progress' }, refs.bar),
        h('div', { class: 'actions' },
          h('span', { class: 'muted small' }, 'Extend'),
          [5, 10, 15].map((m) => h('button', { class: 'btn', onClick: () => ctx.extend(m) }, `+${m}`)),
          h('button', { class: 'btn primary', onClick: () => ctx.skip(), title: 'End this block now and start the next one' }, 'Skip to next ▸'),
          ctx.undoAvailable ? h('button', { class: 'btn ghost', onClick: () => ctx.undo() }, 'Undo') : null,
        ),
      ),
    ));
  } else {
    refs.countdown = h('div', { class: 'countdown small' });
    let title = 'Nothing scheduled today';
    let note = vm.day.off ? 'Marked as a day off.' : 'Add blocks for this day in the editor.';
    if (vm.phase === 'before') { title = 'Your day hasn\'t started'; note = `First up: ${vm.next.title} at ${label12(toMin(vm.next.start))}`; }
    if (vm.phase === 'gap') { title = 'Free time'; note = `Next: ${vm.next.title} at ${label12(toMin(vm.next.start))}`; }
    if (vm.phase === 'after') { title = 'Day complete'; note = 'Nice work. How did it go?'; }
    main.append(h('div', { class: 'now-card idle' },
      h('div', { class: 'now-body' },
        h('h1', { class: 'now-title' }, title),
        h('p', { class: 'now-notes' }, note),
        vm.next ? refs.countdown : null,
        vm.phase === 'after'
          ? h('button', { class: 'btn primary', onClick: () => ctx.go('journal', { key: vm.day.key }) }, 'Write today\'s journal')
          : null,
        vm.phase === 'none' ? h('button', { class: 'btn', onClick: () => ctx.go('edit', { day: dayKeyOf(vm.now) }) }, `Edit ${DAY_NAMES[dayKeyOf(vm.now)]}s`) : null,
      ),
    ));
  }

  if (vm.next && vm.current) {
    const cat = categoryOf(ctx.schedule, vm.next);
    refs.nextIn = h('span', { class: 'muted' });
    main.append(h('div', { class: 'up-next', style: { '--cat': cat.color } },
      h('span', { class: 'eyebrow' }, 'Up next'),
      h('span', { class: 'swatch' }),
      h('strong', null, `${label12(toMin(vm.next.start))} ${vm.next.title}`),
      vm.next.notes ? h('span', { class: 'muted' }, vm.next.notes.split('\n')[0]) : null,
      refs.nextIn,
    ));
  }

  if (vm.day.blocks.length) {
    layout.append(h('aside', { class: 'today card' }, h('div', { class: 'eyebrow' }, 'Today'), todayList(ctx, vm)));
  }
  el.append(layout);

  function update(v) {
    if (v.current) {
      refs.countdown.textContent = formatCountdown(v.remaining);
      refs.sub.textContent = `remaining · ends ${label12(toMin(v.current.end))}`;
      refs.bar.style.width = `${Math.min(100, Math.max(0, v.progress * 100)).toFixed(2)}%`;
      if (refs.nextIn) refs.nextIn.textContent = `in ${formatShort(v.untilNext)}`;
    } else if (v.next && refs.countdown) {
      refs.countdown.textContent = `${formatCountdown(v.untilNext)} until ${v.next.title}`;
    }
  }
  return { el, update, live: true };
}
