// Time helpers. Block times are stored as "HH:MM" (24h) strings and handled
// internally as minutes since local midnight.

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_NAMES = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

export function toMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return NaN;
  return h * 60 + min;
}

export function fromMin(total) {
  const t = Math.max(0, Math.min(24 * 60, Math.round(total)));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// "1:30" style label, matching the printed schedule (no AM/PM).
export function label12(total, { meridiem = false } = {}) {
  const t = Math.round(total);
  let h = Math.floor(t / 60) % 24;
  const m = t % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const base = `${h}:${String(m).padStart(2, '0')}`;
  return meridiem ? `${base} ${suffix}` : base;
}

export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dayKeyOf(date) {
  return DAY_KEYS[date.getDay()];
}

export function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60000;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function startOfWeek(date) {
  // Monday-based week.
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7;
  return addDays(d, -offset);
}

// "47:12", "1:05:00"
export function formatCountdown(minutes) {
  const totalSec = Math.max(0, Math.ceil(minutes * 60));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// "47m", "1h 05m", "<1m"
export function formatShort(minutes) {
  if (minutes < 1) return '<1m';
  const total = Math.floor(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

// Spoken duration: "1 hour 30 minutes", "45 minutes".
export function formatSpokenDuration(minutes) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m || !h) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  return parts.join(' ');
}

// Parses spreadsheet-style time text: "7:30", "7:30 AM", "1:00 pm", "13:00", "7".
// Returns { min, explicit } where explicit means AM/PM or 24h (>12) was given,
// or null when the text is not a time.
export function parseTimeText(text) {
  const s = String(text).trim().toLowerCase().replace(/\./g, '');
  const m = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59 || h > 24) return null;
  const mer = m[3];
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer.startsWith('p') && h !== 12) h += 12;
    if (mer.startsWith('a') && h === 12) h = 0;
    return { min: h * 60 + min, explicit: true };
  }
  return { min: h * 60 + min, explicit: h === 0 || h > 12 };
}
