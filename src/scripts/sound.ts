/* Interface tick sound, played with Web Audio.
   Browsers only allow audio after the visitor clicks, taps or presses a key,
   so the context is created on the first such gesture; ticks before that are
   silently skipped. The on/off choice is remembered (nav sound button). */

const KEY = 'sound';
let ctx: AudioContext | null = null;
const TICK_SRC = '/audio/tick.wav';
let tickBuf: AudioBuffer | null = null;
let last = 0;

export const isMuted = () => {
  try { return localStorage.getItem(KEY) === 'off'; } catch { return false; }
};

export function setMuted(off: boolean) {
  try { localStorage.setItem(KEY, off ? 'off' : 'on'); } catch {}
  window.dispatchEvent(new CustomEvent('soundchange', { detail: !off }));
  if (!off) unlock();
}

function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // Decoded once, then replayed for every tick
    fetch(TICK_SRC)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx!.decodeAudioData(b))
      .then((buf) => (tickBuf = buf), () => {});
  }
  if (ctx.state === 'suspended') ctx.resume();
}

for (const ev of ['pointerdown', 'keydown', 'touchend']) {
  window.addEventListener(ev, () => { if (!isMuted()) unlock(); }, { passive: true });
}

/** The interface tick (public/audio/tick.wav). */
export function tick() {
  if (!ctx || !tickBuf || ctx.state !== 'running' || isMuted()) return;
  const now = ctx.currentTime;
  // Fast flicks cross several projects; keep them distinct but not machine-gunned
  if (now - last < 0.035) return;
  last = now;
  const src = ctx.createBufferSource();
  src.buffer = tickBuf;
  // A touch of pitch variation so repeated ticks don't sound identical
  src.playbackRate.value = 0.97 + Math.random() * 0.06;
  src.connect(ctx.destination);
  src.start(now);
}
