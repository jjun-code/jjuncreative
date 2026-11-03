import { reduced } from './smooth';

/* A short, dithered trail of accent-coloured pixels behind the mouse. Each move
   lights a small patch of grid cells, thinned out by a Bayer matrix (the same
   ordered dither as the background), and the patch dissolves the same way:
   cells drop out in dither order rather than fading as a whole.
   Desktop with a mouse only. */
const CELL = 4; // px per pixel
const LIFE = 280; // ms a patch lasts
const MAX = 220;
// 4×4 Bayer thresholds, 0–1
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (cx: number, cy: number) => BAYER[(cy & 3) * 4 + (cx & 3)];

type Px = { x: number; y: number; born: number; life: number; th: number };

export function initTrail() {
  const canvas = document.querySelector<HTMLCanvasElement>('.trail');
  if (!canvas || reduced() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    canvas?.remove();
    return;
  }
  const ctx = canvas.getContext('2d')!;
  let color = '';
  const readColor = () => (color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8cff00');
  readColor();
  window.addEventListener('themechange', readColor);

  let dpr = 1;
  const size = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  size();
  window.addEventListener('resize', size);

  const pixels: Px[] = [];
  const lit = new Set<string>();
  let lx = -1, ly = -1, raf = 0;

  // A tiny patch around a point: cells closer to the centre are more likely
  // to pass the dither, so the patch reads as a soft speck, not a block
  const patch = (x: number, y: number, now: number, strength: number) => {
    const cx0 = Math.floor(x / CELL), cy0 = Math.floor(y / CELL);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = cx0 + dx, cy = cy0 + dy;
        const key = `${cx},${cy}`;
        const th = bayer(cx, cy);
        const density = strength * (dx === 0 && dy === 0 ? 0.9 : 0.35);
        if (th > density || lit.has(key)) continue;
        lit.add(key);
        pixels.push({ x: cx * CELL, y: cy * CELL, born: now, life: LIFE * (0.7 + Math.random() * 0.5), th });
      }
    }
    if (pixels.length > MAX) pixels.splice(0, pixels.length - MAX);
  };

  const draw = (now: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    for (let i = pixels.length - 1; i >= 0; i--) {
      const p = pixels[i];
      const left = 1 - (now - p.born) / p.life;
      // Dissolve: a cell goes once what's left of its life drops below its
      // dither threshold, so the patch thins out in the dither pattern
      if (left <= p.th * 0.9) {
        pixels.splice(i, 1);
        lit.delete(`${p.x / CELL},${p.y / CELL}`);
        continue;
      }
      ctx.fillRect(p.x, p.y, CELL, CELL);
    }
    raf = pixels.length ? requestAnimationFrame(draw) : 0;
  };

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const now = performance.now();
    const x = e.clientX, y = e.clientY;
    if (lx >= 0) {
      // Faster moves leave a slightly denser trail; gaps are filled every few cells
      const dist = Math.hypot(x - lx, y - ly);
      const strength = Math.min(1, 0.45 + dist / 60);
      const steps = Math.min(16, Math.ceil(dist / (CELL * 3)));
      for (let s = 1; s <= steps; s++) patch(lx + ((x - lx) * s) / steps, ly + ((y - ly) * s) / steps, now, strength);
    }
    lx = x; ly = y;
    if (!raf && pixels.length) raf = requestAnimationFrame(draw);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { lx = ly = -1; });
}
