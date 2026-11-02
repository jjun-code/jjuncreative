/* Interface tick sound (played with Web Audio) plus a background music track.
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
  if (!off) { unlock(); playMusic(); } else pauseMusic();
}

/* ── Background music ──
   A looping track that follows the same on/off switch. It fades in on the
   first gesture, pauses while the tab is hidden, and picks up where it left
   off on the next page. Browsers without Ogg Vorbis (older Safari) skip it. */
const MUSIC_SRC = '/audio/gentle-static-sky.ogg';
const MUSIC_VOLUME = 0.175;
const POS_KEY = 'music-pos';
let music: HTMLAudioElement | null = null;
let fade = 0;

function getMusic() {
  if (music) return music;
  const a = new Audio();
  if (!a.canPlayType('audio/ogg; codecs="vorbis"')) return null;
  a.src = MUSIC_SRC;
  a.loop = true;
  a.preload = 'auto';
  a.volume = 0;
  try {
    const pos = Number(sessionStorage.getItem(POS_KEY));
    if (pos > 0) a.currentTime = pos;
  } catch {}
  return (music = a);
}

function fadeTo(target: number, ms: number, done?: () => void) {
  const a = music;
  if (!a) return;
  cancelAnimationFrame(fade);
  const from = a.volume, t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    a.volume = from + (target - from) * k;
    if (k < 1) fade = requestAnimationFrame(step);
    else done?.();
  };
  fade = requestAnimationFrame(step);
}

function playMusic() {
  const a = getMusic();
  if (!a || isMuted() || document.hidden) return;
  // Still playing (e.g. unmuted mid fade-out): fade back up, which also
  // cancels the pending pause
  if (!a.paused) { fadeTo(MUSIC_VOLUME, 600); return; }
  // Rejected until the visitor has interacted; the gesture listeners retry
  a.play().then(() => fadeTo(MUSIC_VOLUME, 1800), () => {});
}

function pauseMusic() {
  if (!music || music.paused) return;
  fadeTo(0, 400, () => music?.pause());
}

// Some browsers allow playback straight away on return visits
playMusic();
document.addEventListener('visibilitychange', () => (document.hidden ? pauseMusic() : playMusic()));
window.addEventListener('pagehide', () => {
  try { if (music) sessionStorage.setItem(POS_KEY, String(music.currentTime)); } catch {}
});

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
  window.addEventListener(ev, () => { if (!isMuted()) { unlock(); playMusic(); } }, { passive: true });
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
