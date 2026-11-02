/* Interface sounds, synthesised with Web Audio so there are no files to load.
   Browsers only allow audio after the visitor clicks, taps or presses a key,
   so the context is created on the first such gesture; ticks before that are
   silently skipped. The on/off choice is remembered (nav sound button). */

const KEY = 'sound';
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
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
    // A short burst of white noise, reused for every tick
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

for (const ev of ['pointerdown', 'keydown', 'touchend']) {
  window.addEventListener(ev, () => { if (!isMuted()) unlock(); }, { passive: true });
}

/** A dry mechanical tick, like a detent on a dial. */
export function tick() {
  if (!ctx || !noise || ctx.state !== 'running' || isMuted()) return;
  const now = ctx.currentTime;
  // Fast flicks cross several projects; keep them distinct but not machine-gunned
  if (now - last < 0.035) return;
  last = now;
  const vary = 0.92 + Math.random() * 0.16;

  // Body: filtered noise, very short
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 3200 * vary;
  band.Q.value = 2.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.22, now + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
  src.connect(band).connect(g).connect(ctx.destination);
  src.start(now);
  src.stop(now + 0.03);

  // Click: a tiny falling sine for a solid, tactile edge
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1900 * vary, now);
  osc.frequency.exponentialRampToValueAtTime(700, now + 0.02);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.09, now + 0.001);
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
  osc.connect(og).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.025);
}
