/* Interface sounds, played with Web Audio: a tick when scrolling through the
   projects, a soft tap when pressing buttons, and a hum when opening a project;
   plus a quiet background music track (below).
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

/* ── Background music ──
   A looping track that follows the same on/off switch. It fades in on the
   visitor's first click, tap or key press (browsers block sound before that),
   pauses while the tab is hidden, and carries on across page changes (pages
   swap without a reload, and the player isn't part of the page). Its volume
   goes through a Web Audio gain, since iPhones ignore a media element's own
   volume. Ogg where the browser plays it (smaller), MP3 elsewhere (Safari). */
const MUSIC_SRC = { ogg: '/audio/quiet-horizon.ogg', mp3: '/audio/quiet-horizon.mp3' };
const MUSIC_VOLUME = 0.132; // quiet: well under the interface sounds
const POS_KEY = 'music-pos';
let music: HTMLAudioElement | null = null;
let gain: GainNode | null = null;

function getMusic() {
  if (music) return music;
  const a = new Audio();
  a.src = a.canPlayType('audio/ogg; codecs="vorbis"') ? MUSIC_SRC.ogg : MUSIC_SRC.mp3;
  a.loop = true;
  a.preload = 'none';
  try {
    const pos = Number(sessionStorage.getItem(POS_KEY));
    if (pos > 0) a.currentTime = pos;
  } catch {}
  return (music = a);
}

// Route the track through a gain once the audio context exists
function connect(a: HTMLAudioElement) {
  if (gain || !ctx) return;
  gain = ctx.createGain();
  gain.gain.value = 0;
  ctx.createMediaElementSource(a).connect(gain).connect(ctx.destination);
}

// Smoothly towards a volume (the time constant is about a third of the fade)
function fadeTo(target: number, seconds: number) {
  if (!gain || !ctx) return;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setTargetAtTime(target, ctx.currentTime, seconds / 3);
}

function playMusic() {
  const a = getMusic();
  if (!a || !ctx || isMuted() || document.hidden) return;
  connect(a);
  if (!a.paused) { fadeTo(MUSIC_VOLUME, 0.6); return; }
  // Rejected until the visitor has interacted; the gesture listeners retry
  a.play().then(() => fadeTo(MUSIC_VOLUME, 2.5), () => {});
}

let pauseTimer = 0;
function pauseMusic() {
  if (!music || music.paused) return;
  fadeTo(0, 0.4);
  clearTimeout(pauseTimer);
  pauseTimer = window.setTimeout(() => { if (isMuted() || document.hidden) music?.pause(); }, 500);
}

document.addEventListener('visibilitychange', () => (document.hidden ? pauseMusic() : playMusic()));
window.addEventListener('pagehide', () => {
  try { if (music) sessionStorage.setItem(POS_KEY, String(music.currentTime)); } catch {}
});

for (const ev of ['pointerdown', 'keydown', 'touchend']) {
  window.addEventListener(ev, () => { if (!isMuted()) { unlock(); playMusic(); } }, { passive: true });
}

/** A soft, short "pop" for pressing buttons, synthesised so there's no file:
    a sine that drops in pitch over ~90ms. */
export function tap() {
  const c = ctx;
  if (!c || isMuted()) return;
  const play = () => {
    const now = c.currentTime;
    const vary = 0.96 + Math.random() * 0.08;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620 * vary, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.07);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.16, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(g).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  };
  // The very first press also wakes the audio context, which takes a moment
  if (c.state === 'suspended') c.resume().then(play, () => {}); else play();
}

/** A subtle, airy hum for opening a project card: a soft open chord of sines,
    slightly detuned against each other so it shimmers, swelling in and
    fading out over ~1.6s through a gentle low-pass. */
export function hum() {
  const c = ctx;
  if (!c || isMuted()) return;
  const play = () => {
    const now = c.currentTime;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.07, now + 0.18);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, now);
    lp.frequency.exponentialRampToValueAtTime(700, now + 1.6);
    out.connect(lp).connect(c.destination);
    // A3, E4, A4, plus a faint E5 on top for air; each with a slow wobble
    for (const [f, level] of [[220, 1], [329.6, 0.7], [440, 0.55], [659.3, 0.25]] as const) {
      for (const detune of [-6, 6]) {
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        osc.detune.value = detune;
        const lfo = c.createOscillator(), depth = c.createGain();
        lfo.frequency.value = 3 + Math.random() * 2;
        depth.gain.value = 4; // cents
        lfo.connect(depth).connect(osc.detune);
        const g = c.createGain();
        g.gain.value = level / 2;
        osc.connect(g).connect(out);
        osc.start(now); lfo.start(now);
        osc.stop(now + 1.7); lfo.stop(now + 1.7);
      }
    }
  };
  if (c.state === 'suspended') c.resume().then(play, () => {}); else play();
}

// Buttons anywhere on the site get the tap: header buttons, menu links, the
// footer email, toolkit cards. Registered after the unlock listener above, so
// the first press can already be heard.
const TAPPABLE = 'button, [role="button"], .round, .menu-links a, .tool';
window.addEventListener('pointerdown', (e) => {
  if (e.button === 0 && e.target instanceof Element && e.target.closest(TAPPABLE)) tap();
}, { passive: true });
window.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof Element && e.target.closest(TAPPABLE)) tap();
});

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
