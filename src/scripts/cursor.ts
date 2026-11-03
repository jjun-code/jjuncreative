import { gsap } from 'gsap';

/* A pixel circle with a dithered rim, used as the cursor's mask so it matches
   the site's ordered-dither look: solid in the middle (where the label sits),
   breaking into scattered pixels toward the edge. FRAMES variations sit side
   by side in one image; CSS steps through them (global.css), so the rim
   shimmers and gently breathes without any per-frame work. Drawn at full size
   so the pixels stay crisp. */
const FRAMES = 8; // keep in step with the cursor-dither animation in global.css
function ditherMask(size: number, cell: number) {
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  // Fixed per-pixel randomness, so each pixel flickers on its own schedule
  const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const n = Math.round(size / cell), r = n / 2;
  const c = document.createElement('canvas');
  c.width = size * FRAMES; c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  for (let k = 0; k < FRAMES; k++) {
    const phase = (k / FRAMES) * Math.PI * 2;
    const start = 0.58 + 0.05 * Math.sin(phase); // the rim breathes in and out
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r; // 0 centre, 1 rim
        const t = Math.min(1, Math.max(0, (d - start) / 0.42));
        const fill = 1 - t * t * (3 - 2 * t); // solid core, easing out across the rim
        // Dither threshold drifts per pixel from frame to frame: rim pixels twinkle
        const th = (bayer[(y & 3) * 4 + (x & 3)] * 0.6 + ((hash(x, y) + k * 0.381) % 1) * 0.4);
        if (fill > th) g.fillRect(k * size + x * cell, y * cell, cell, cell);
      }
    }
  }
  return `url(${c.toDataURL()})`;
}

export function initCursor() {
  const el = document.querySelector<HTMLElement>('.cursor');
  if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const label = el.querySelector('span')!;
  const mask = ditherMask(84, 4);
  label.style.setProperty('-webkit-mask-image', mask);
  label.style.setProperty('mask-image', mask);
  label.style.borderRadius = '0'; // the mask gives the shape; rounding would soften the edge pixels
  const x = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3' });
  const y = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3' });
  window.addEventListener('pointermove', (e) => { x(e.clientX); y(e.clientY); });

  // Any element with data-cursor="label" grows the cursor and shows that label.
  document.addEventListener('pointerover', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-cursor]');
    el.classList.toggle('is-view', !!t);
    if (t) label.textContent = t.dataset.cursor || 'view';
  });
  // The link under the cursor is gone after a page change
  document.addEventListener('astro:after-swap', () => el.classList.remove('is-view'));
  window.addEventListener('cursor:label',((e: CustomEvent<string | null>) => {
    el.classList.toggle('is-view', !!e.detail);
    if (e.detail) label.textContent = e.detail;
  }) as EventListener);
}
