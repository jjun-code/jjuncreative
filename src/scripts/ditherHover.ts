/* Hover effect for a project image: a pixel sweep from the bottom left turns
   the photo into a greyscale ordered dither limited to 4 shades, the same
   dither as the site background and loader. While hovered the pixels shimmer
   slightly; on leave the photo sweeps back. The image must be readable
   (same origin, or served with CORS and loaded with crossorigin). */
import { gsap } from './smooth';

const CELL = 3;    // css px per dither pixel
const SHADES = 4;  // grey levels the image is dithered down to

// Classic 8×8 Bayer matrix (built by doubling the 2×2 one), as 0..1 thresholds
const BAYER = (() => {
  let m = [[0, 2], [3, 1]];
  while (m.length < 8) {
    const n = m.length;
    m = Array.from({ length: n * 2 }, (_, y) => Array.from({ length: n * 2 }, (_, x) =>
      4 * m[y % n][x % n] + [[0, 2], [3, 1]][Math.floor(y / n)][Math.floor(x / n)]));
  }
  return Float32Array.from(m.flat(), (v) => (v + 0.5) / 64);
})();

// Cheap repeatable noise per pixel and frame
const hash = (x: number, y: number, f: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + f * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

export function attachDitherHover(host: HTMLElement, img: HTMLImageElement, reduced: boolean) {
  const canvas = document.createElement('canvas');
  canvas.className = 'dither-hover';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  let w = 0, h = 0, lum: Float32Array | null = null, out: ImageData | null = null;
  const state = { p: 0 };
  let hovering = false, raf = 0, t0 = 0;

  // Sample the image once at dither resolution, cropped like object-fit: cover
  const prepare = () => {
    const rect = host.getBoundingClientRect();
    const cw = host.offsetWidth || rect.width, ch = host.offsetHeight || rect.height;
    w = Math.max(1, Math.round(cw / CELL)); h = Math.max(1, Math.round(ch / CELL));
    canvas.width = w; canvas.height = h;
    out = ctx.createImageData(w, h);
    lum = null;
    if (!img.complete || !img.naturalWidth) return;
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    try {
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      const d = ctx.getImageData(0, 0, w, h).data;
      lum = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) lum[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
      // Auto-levels: stretch the 4th–96th percentile to 0..1 so flat, bright or
      // dark images still dither into readable shapes
      const sorted = Float32Array.from(lum).sort();
      const lo = sorted[Math.floor(sorted.length * 0.04)], hi = sorted[Math.floor(sorted.length * 0.96)];
      const span = Math.max(0.08, hi - lo);
      for (let i = 0; i < lum.length; i++) lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) / span));
    } catch {
      lum = null; // image not readable: the sweep still plays as a flat dither
    }
  };

  const draw = (time: number) => {
    if (!out) return;
    const d = out.data, p = state.p, frame = Math.floor(time * 12);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4;
        const th = BAYER[(y & 7) * 8 + (x & 7)];
        // Reveal sweeps from the bottom left, broken up by the dither pattern
        const sweep = (x / w) * 0.5 + (1 - y / h) * 0.5;
        if (p * 1.25 <= sweep * 0.75 + th * 0.25) { d[o + 3] = 0; continue; }
        // Random per-pixel twinkle, re-rolled about 12 times a second
        const shimmer = reduced ? 0 : (hash(x, y, frame) - 0.5) * 0.05;
        const v = Math.min(1, Math.max(0, (lum ? lum[i] : 0.5) + shimmer));
        // Ordered dither between the two nearest grey levels
        const level = Math.min(SHADES - 1, Math.floor(v * (SHADES - 1) + th));
        const g = Math.round(10 + (level / (SHADES - 1)) * 235);
        d[o] = g; d[o + 1] = g; d[o + 2] = g; d[o + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  };

  const loop = (now: number) => {
    draw((now - t0) / 1000);
    if (hovering || state.p > 0) raf = requestAnimationFrame(loop);
    else { raf = 0; ctx.clearRect(0, 0, w, h); }
  };
  const start = () => { if (!raf) { t0 = performance.now(); raf = requestAnimationFrame(loop); } };

  const enter = () => {
    if (!lum || canvas.width !== Math.max(1, Math.round(host.offsetWidth / CELL))) prepare();
    hovering = true;
    gsap.to(state, { p: 1, duration: reduced ? 0.01 : 0.55, ease: 'power2.out', overwrite: true });
    start();
  };
  const leave = () => {
    hovering = false;
    gsap.to(state, { p: 0, duration: reduced ? 0.01 : 0.4, ease: 'power2.in', overwrite: true });
    start();
  };

  // Mouse hover only (taps go straight to the project); keyboard focus too
  host.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') enter(); });
  host.addEventListener('pointerleave', () => { if (hovering) leave(); });
  host.addEventListener('focus', () => { if (host.matches(':focus-visible')) enter(); });
  host.addEventListener('blur', () => { if (hovering) leave(); });
  if (!img.complete) img.addEventListener('load', () => { lum = null; }, { once: true });

  return { leave: () => { if (hovering || state.p > 0) leave(); } };
}
