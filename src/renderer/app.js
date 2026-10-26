// App state, persistence, alert dispatch and view routing.

import { h, clear, toast } from './dom.js';
import { createEngine, computeView } from './engine.js';
import { chime, speak } from './sounds.js';
import {
  normalizeSchedule, alertLevel, categoryOf, extendBlock, skipBlock, withException, withoutException,
  findPosition,
} from '../core/schedule.js';
import { sampleSchedule } from '../core/sample-schedule.js';
import { dateKey, label12, toMin, formatShort, formatCountdown, fromMin } from '../core/time.js';
import * as nowView from './views/now.js';
import * as weekView from './views/week.js';
import * as editView from './views/edit.js';
import * as journalView from './views/journal.js';
import * as settingsView from './views/settings.js';

const api = window.api;

export const DEFAULT_SETTINGS = {
  sound: true,
  voice: true,
  notifications: true,
  volume: 0.7,
  voiceName: '',
  voiceRate: 1,
  speakNotes: true,
  warnMinutes: 5,
  journalPrompt: true,
  menuBarCountdown: true,
  onboarded: false,
};

const state = {
  schedule: null,
  settings: { ...DEFAULT_SETTINGS },
  journal: { entries: {}, logs: {} },
  vm: null,
  view: 'now',
  current: null, // { name, el, update, canLeave }
  undo: [], // [{ key, exception }] snapshots for today's adjustments
  miniOpen: false,
};

const VIEWS = { now: nowView, week: weekView, edit: editView, journal: journalView, settings: settingsView };

// ---------- persistence ----------

function saveSoon(name) {
  clearTimeout(saveSoon[name]);
  saveSoon[name] = setTimeout(() => api.save(name, state[name]).catch((e) => toast(`Couldn't save ${name}: ${e.message}`)), 250);
}

const ctx = {
  api,
  get schedule() { return state.schedule; },
  get settings() { return state.settings; },
  get journal() { return state.journal; },
  get vm() { return state.vm; },
  get undoAvailable() { return state.undo.some((u) => u.key === dateKey(new Date())); },

  setSchedule(next, { render = true } = {}) {
    state.schedule = normalizeSchedule(next);
    saveSoon('schedule');
    engine.tick();
    if (render) rerender();
  },
  setSettings(patch, { render = false } = {}) {
    state.settings = { ...state.settings, ...patch };
    saveSoon('settings');
    if (render) rerender();
  },
  setJournalEntry(key, entry) {
    state.journal = { ...state.journal, entries: { ...state.journal.entries, [key]: { ...entry, updatedAt: new Date().toISOString() } } };
    saveSoon('journal');
  },
  replaceJournal(journal) {
    state.journal = { entries: journal?.entries || {}, logs: journal?.logs || {} };
    saveSoon('journal');
  },
  log(key, text) {
    const at = fromMin(Math.floor(state.vm?.nowMin ?? 0));
    const logs = { ...state.journal.logs, [key]: [...(state.journal.logs[key] || []), { at, text }] };
    state.journal = { ...state.journal, logs };
    saveSoon('journal');
  },

  extend(minutes) {
    const vm = computeView(state.schedule, new Date());
    if (!vm.current) return;
    pushUndo(vm.day.key);
    const blocks = extendBlock(vm.day.blocks, vm.current.id, minutes);
    const newEnd = blocks.find((b) => b.id === vm.current.id).end;
    ctx.setSchedule(withException(state.schedule, vm.now, blocks), { render: false });
    ctx.log(vm.day.key, `Extended "${vm.current.title}" by ${minutes} min (now ends ${label12(toMin(newEnd))})`);
    toast(`${vm.current.title} extended to ${label12(toMin(newEnd))}`, { action: 'Undo', onAction: ctx.undo });
    rerender();
  },
  skip() {
    const vm = computeView(state.schedule, new Date());
    if (!vm.current) return;
    pushUndo(vm.day.key);
    const blocks = skipBlock(vm.day.blocks, vm.current.id, vm.nowMin);
    ctx.setSchedule(withException(state.schedule, vm.now, blocks), { render: false });
    ctx.log(vm.day.key, `Skipped ahead from "${vm.current.title}" with ${formatShort(vm.remaining)} left`);
    engine.announceCurrent();
    toast(`Skipped ahead from ${vm.current.title}`, { action: 'Undo', onAction: ctx.undo });
    rerender();
  },
  undo() {
    const key = dateKey(new Date());
    const i = state.undo.map((u) => u.key).lastIndexOf(key);
    if (i < 0) return;
    const [snap] = state.undo.splice(i, 1);
    const base = withoutException(state.schedule, key);
    ctx.setSchedule(snap.exception ? { ...base, exceptions: { ...base.exceptions, [key]: snap.exception } } : base, { render: false });
    const logs = state.journal.logs[key] || [];
    state.journal = { ...state.journal, logs: { ...state.journal.logs, [key]: logs.slice(0, -1) } };
    saveSoon('journal');
    engine.resync();
    rerender();
  },

  go,
  toggleMini() { setMini(!state.miniOpen); },
  testAlert(type) { testAlert(type); },
};

function pushUndo(key) {
  const ex = state.schedule.exceptions[key];
  state.undo.push({ key, exception: ex ? structuredClone(ex) : null });
  if (state.undo.length > 20) state.undo.shift();
}

// ---------- alerts ----------

function firstLine(text) {
  return (text || '').split('\n')[0].trim();
}

function describe(ev, vm) {
  const s = state.settings;
  const b = ev.block;
  const notes = s.speakNotes ? firstLine(b.notes) : '';
  const until = label12(toMin(b.end));
  switch (ev.type) {
    case 'start': {
      const body = [b.notes ? firstLine(b.notes) : '', `Until ${until}`].filter(Boolean).join(' · ');
      return {
        title: `Now: ${b.title}`,
        body,
        speech: [b.title, notes, `until ${until}.`].filter(Boolean).join('. '),
      };
    }
    case 'warn': {
      const left = s.warnMinutes;
      const next = ev.next ? `Next: ${ev.next.title}.` : 'Last block before a break.';
      return {
        title: `${left} min left: ${b.title}`,
        body: ev.next ? `Next: ${ev.next.title} at ${until}` : `Ends at ${until}`,
        speech: `${left} minute${left === 1 ? '' : 's'} left in ${b.title}. ${next}`,
      };
    }
    case 'end': {
      if (ev.lastOfDay) {
        return {
          title: "That's the day",
          body: state.settings.journalPrompt ? 'Take two minutes for your journal.' : `${b.title} is done.`,
          speech: `${b.title} is done. That's the end of your day.${state.settings.journalPrompt ? ' Time for your journal.' : ''}`,
        };
      }
      const next = findPosition(vm.day.blocks, toMin(b.end)).next;
      const nextText = next ? `Next: ${next.title} at ${label12(toMin(next.start))}` : '';
      return { title: `${b.title} is done`, body: nextText || 'Free time', speech: `${b.title} is done. ${nextText}.` };
    }
    default:
      return { title: b.title, body: '', speech: b.title };
  }
}

function alert(ev, vm) {
  const level = alertLevel(state.schedule, ev.block);
  const s = state.settings;
  const dayEnd = ev.type === 'end' && ev.lastOfDay;
  const msg = describe(ev, vm);
  if (level !== 'off' || dayEnd) {
    if (s.notifications) api.notify({ title: msg.title, body: msg.body });
    if (level === 'full' || dayEnd) {
      const delay = s.sound ? chime(dayEnd ? 'dayEnd' : ev.type, s.volume) : 0;
      if (s.voice) speak(msg.speech, { voiceName: s.voiceName, rate: s.voiceRate, volume: s.volume, delay });
    }
  }
  if (dayEnd && s.journalPrompt) {
    api.showMain();
    go('journal', { key: vm.day.key });
  }
}

function testAlert(type) {
  const vm = state.vm;
  const sample = vm?.current || vm?.next || { title: 'Estimating', notes: 'Heads-down: quotes and bids', start: '13:00', end: '15:30', category: state.schedule.categories[0].id };
  const ev = { type: type === 'dayEnd' ? 'end' : type, block: sample, next: vm?.next || null, lastOfDay: type === 'dayEnd' };
  const msg = describe(ev, vm || computeView(state.schedule, new Date()));
  const s = state.settings;
  if (type === 'notification') return api.notify({ title: msg.title, body: msg.body });
  const delay = s.sound ? chime(type, s.volume) : 0;
  if (type === 'voice' || s.voice) speak(msg.speech, { voiceName: s.voiceName, rate: s.voiceRate, volume: s.volume, delay: type === 'voice' ? 0 : delay });
}

// ---------- tray / mini timer ----------

function publish(vm) {
  const s = state.settings;
  const cat = vm.current ? categoryOf(state.schedule, vm.current) : null;
  let nowLabel = 'Nothing scheduled';
  let trayTitle = '';
  let headline = 'Nothing scheduled';
  let countdown = '';
  if (vm.current) {
    nowLabel = `Now: ${vm.current.title} (${label12(toMin(vm.current.start))}–${label12(toMin(vm.current.end))})`;
    trayTitle = `${vm.current.title} · ${formatShort(vm.remaining)}`;
    headline = vm.current.title;
    countdown = formatCountdown(vm.remaining);
  } else if (vm.phase === 'before' || vm.phase === 'gap') {
    nowLabel = vm.phase === 'gap' ? 'Free time' : 'Day not started';
    trayTitle = `${vm.next.title} in ${formatShort(vm.untilNext)}`;
    headline = vm.phase === 'gap' ? 'Free time' : 'Starts soon';
    countdown = formatCountdown(vm.untilNext);
  } else if (vm.phase === 'after') {
    nowLabel = 'Day complete';
    headline = 'Day complete';
  }
  const nextLabel = vm.next ? `Next: ${vm.next.title} at ${label12(toMin(vm.next.start))}` : '';
  api.publishState({
    trayTitle: s.menuBarCountdown ? trayTitle : '',
    tooltip: [nowLabel, vm.current ? `${formatShort(vm.remaining)} left` : '', nextLabel].filter(Boolean).join('\n'),
    nowLabel,
    nextLabel,
    canAdjust: Boolean(vm.current),
    mini: {
      headline,
      countdown,
      color: cat?.color || '#dbe6f4',
      progress: vm.progress,
      sub: vm.current ? `until ${label12(toMin(vm.current.end))}` : vm.next ? `${vm.next.title} at ${label12(toMin(vm.next.start))}` : '',
      nextLabel: vm.current && vm.next ? `Next: ${vm.next.title}` : '',
      canAdjust: Boolean(vm.current),
    },
  });
}

function setMini(on) {
  state.miniOpen = on;
  api.setMini(on);
  document.getElementById('mini-btn').classList.toggle('active', on);
}

// ---------- views ----------

const viewEl = document.getElementById('view');

function go(name, params = {}) {
  if (!VIEWS[name]) return;
  if (state.current?.canLeave && !state.current.canLeave()) return;
  state.view = name;
  state.params = params;
  rerender();
}

function rerender() {
  const mod = VIEWS[state.view];
  const scroll = state.current?.name === state.view ? viewEl.scrollTop : 0;
  const out = mod.render(ctx, state.params || {});
  state.current = { name: state.view, ...out };
  clear(viewEl).append(out.el);
  viewEl.scrollTop = scroll;
  viewEl.dataset.view = state.view;
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b.dataset.view === state.view);
  if (state.vm) out.update?.(state.vm);
}

function onTick(vm) {
  const prevKey = state.vm && `${state.vm.day.key}|${state.vm.current?.id}|${state.vm.phase}|${state.vm.next?.id}`;
  state.vm = vm;
  const key = `${vm.day.key}|${vm.current?.id}|${vm.phase}|${vm.next?.id}`;
  document.getElementById('clock').textContent = vm.now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // Views that show the current block rebuild when it changes; otherwise
  // they just refresh their countdowns.
  if (!prevKey || (prevKey !== key && state.current?.live)) rerender();
  else state.current?.update?.(vm);
  publish(vm);
}

const engine = createEngine({
  getSchedule: () => state.schedule,
  getSettings: () => state.settings,
  onTick,
  onEvent: alert,
});

// ---------- startup ----------

async function init() {
  const [schedule, settings, journal] = await Promise.all([api.load('schedule'), api.load('settings'), api.load('journal')]);
  try {
    state.schedule = schedule ? normalizeSchedule(schedule) : sampleSchedule();
  } catch {
    state.schedule = sampleSchedule();
  }
  if (!schedule) api.save('schedule', state.schedule);
  state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  state.journal = { entries: journal?.entries || {}, logs: journal?.logs || {} };

  for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => go(b.dataset.view));
  document.getElementById('mini-btn').addEventListener('click', () => ctx.toggleMini());
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 5 && (e.metaKey || e.ctrlKey)) go(Object.keys(VIEWS)[n - 1]);
  });

  api.onAction((action) => {
    if (action.startsWith('extend:')) ctx.extend(Number(action.split(':')[1]));
    else if (action === 'skip') ctx.skip();
    else if (action === 'mini:closed') { state.miniOpen = false; document.getElementById('mini-btn').classList.remove('active'); }
    else if (action.startsWith('view:')) go(action.slice(5), action === 'view:journal' ? { key: dateKey(new Date()) } : {});
  });
  api.onResume(() => engine.resync());

  rerender();
  engine.start();
}

init();
