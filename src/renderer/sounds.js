// Chimes synthesized with Web Audio (no sound files) and spoken announcements
// via the system's text-to-speech voices.

let ctx = null;
function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// A soft bell: a few inharmonic partials with exponential decay.
function bell(ac, freq, at, { gain = 0.3, decay = 1.6 } = {}) {
  const out = ac.createGain();
  out.gain.setValueAtTime(0, at);
  out.gain.linearRampToValueAtTime(gain, at + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  out.connect(ac.destination);
  for (const [ratio, amp] of [[1, 1], [2.0, 0.35], [3.01, 0.16], [4.2, 0.08]]) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    g.gain.value = amp;
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }
}

const PATTERNS = {
  // Rising pair: a new block is starting.
  start: [[659.25, 0], [987.77, 0.18]],
  // Single low tone: heads-up before a block ends.
  warn: [[587.33, 0]],
  // Falling pair: a block ended with nothing right after it.
  end: [[987.77, 0], [659.25, 0.2]],
  // Three falling notes: the day is done.
  dayEnd: [[1046.5, 0], [783.99, 0.22], [523.25, 0.44]],
};

export function chime(kind, volume = 0.7) {
  const ac = audio();
  const t = ac.currentTime + 0.02;
  const pattern = PATTERNS[kind] || PATTERNS.start;
  for (const [f, dt] of pattern) bell(ac, f, t + dt, { gain: 0.32 * volume, decay: kind === 'warn' ? 1.1 : 1.8 });
  return (pattern.at(-1)[1] + 0.5) * 1000; // ms until it's safe to start speaking
}

export function listVoices() {
  return window.speechSynthesis ? speechSynthesis.getVoices() : [];
}

export function onVoicesChanged(cb) {
  if (window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', cb);
}

export function speak(text, { voiceName = '', rate = 1, volume = 0.8, delay = 0 } = {}) {
  if (!window.speechSynthesis || !text) return;
  setTimeout(() => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = listVoices().find((v) => v.name === voiceName);
    if (voice) u.voice = voice;
    u.rate = rate;
    u.volume = volume;
    speechSynthesis.speak(u);
  }, delay);
}
