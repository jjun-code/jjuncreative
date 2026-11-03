/* The photo field: photos on an endless staggered grid (alternate columns
   dropped by half a row, like brickwork) that the visitor drags around freely,
   with a fisheye at the screen edges (drawn by gallery.ts). The grid never
   ends: it repeats a large tile of cells, each given a photo at random (a
   fresh shuffle on every visit) so that no photo sits next to itself and
   every photo turns up about as often as the others. Each photo keeps its
   own shape inside its cell, with its title running up its right edge.
   Only the cells on screen are drawn, so it costs the same with 10 photos or
   1,000. */
import { lensScreen, lensSource, type CardDraw } from './gallery';

type Gallery = { draw: (...a: any[]) => void; aspectOf: (i: number) => number | null };
type Item = { title: string; kind?: string; more?: unknown[] };
// Videos and links are marked before their title
const mark: Record<string, string> = { video: '▶ ', link: '↗ ' };

export function createPhotoField(opts: {
  canvas: HTMLCanvasElement;
  labels: HTMLElement; // holds the titles
  gallery: Gallery;
  onHover: (i: number) => void; // photo index, or -1
  onOpen: (i: number) => void;
  reduced?: boolean; // skip the entrance
  loader?: HTMLElement; // ring showing how many covers have loaded
}) {
  const { canvas, labels, gallery } = opts;
  let items: Item[] = [];
  let n = 0;
  let active = false;

  // ── Cells ──
  let W = 0, H = 0, cw = 0, chh = 0, pitchX = 0, pitchY = 0;
  const measure = () => {
    W = window.innerWidth; H = window.innerHeight;
    const phone = W < 760;
    cw = phone ? W * 0.34 : Math.min(W * 0.115, 210); // a cell's photo box
    chh = cw * 1.25;
    pitchX = cw * (phone ? 1.28 : 1.32); // room for the title beside each photo
    pitchY = chh + cw * 0.22;
  };
  measure();
  const mod = (a: number, b: number) => ((a % b) + b) % b;
  // ── Which photo goes in each cell: a seeded shuffle, tiled ──
  // A TC × TR tile is filled cell by cell. Each cell takes the least-used
  // photo that none of its neighbours (left, right, above, below, and the two
  // diagonal ones the brick offset brings close) already has, ties broken at
  // random; the tile then repeats in every direction, wrapping round its
  // edges so the seams follow the same rule
  let TC = 1, TR = 1, tile: number[] = [0];
  const shuffle = () => {
    TC = Math.max(8, Math.min(24, n * 2)) & ~1; // even, so the brick offset lines up
    TR = Math.max(6, Math.min(16, n));
    tile = new Array(TC * TR).fill(-1);
    // A new seed each page load, so every visit gets a different arrangement
    let seed = (Math.random() * 4294967296) >>> 0;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const used = new Array(n).fill(0);
    const at = (c: number, r: number) => tile[mod(r, TR) * TC + mod(c, TC)];
    for (let r = 0; r < TR; r++) {
      for (let c = 0; c < TC; c++) {
        // Odd columns sit half a row lower, so their diagonal neighbours are
        // one row down; even columns' are one row up
        const dr = c % 2 ? 1 : -1;
        const near = [at(c - 1, r), at(c + 1, r), at(c, r - 1), at(c, r + 1), at(c - 1, r + dr), at(c + 1, r + dr)];
        let ok = [...Array(n).keys()].filter((i) => !near.includes(i));
        if (!ok.length) ok = [...Array(n).keys()].filter((i) => i !== at(c - 1, r));
        if (!ok.length) ok = [0];
        const least = Math.min(...ok.map((i) => used[i]));
        const pick = ok.filter((i) => used[i] === least);
        const i = pick[Math.floor(rand() * pick.length)];
        tile[r * TC + c] = i;
        used[i]++;
      }
    }
  };
  const itemOf = (c: number, r: number) => tile[mod(r, TR) * TC + mod(c, TC)];
  // A photo's rectangle in its cell, in scene px before the pan
  const box = (c: number, r: number) => {
    const i = itemOf(c, r);
    const a = gallery.aspectOf(i) ?? 0.8;
    const w = a >= cw / chh ? cw : chh * a, h = w / a;
    const x = c * pitchX + (cw - w) / 2;
    const y = r * pitchY + (mod(c, 2) ? pitchY / 2 : 0) + (chh - h) / 2;
    return { i, x, y, w, h };
  };

  // ── Pan: px, with inertia; the field starts centred ──
  let ox = 0, oy = 0, vx = 0, vy = 0;
  const centre = () => { ox = cw / 2 - W / 2; oy = chh / 2 - H / 2; vx = vy = 0; };

  // Cells that can show on screen (the lens only ever pulls the middle of the
  // scene outward, so the screen rectangle plus one cell is enough)
  const visible = () => {
    const out: ReturnType<typeof box>[] = [];
    const c0 = Math.floor(ox / pitchX) - 1, c1 = Math.ceil((ox + W) / pitchX) + 1;
    const r0 = Math.floor(oy / pitchY) - 1, r1 = Math.ceil((oy + H) / pitchY) + 1;
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) out.push(box(c, r));
    return out;
  };

  // Which photo is at a screen point (undoing the lens first)
  const itemAt = (x: number, y: number) => {
    const [sx, sy] = lensSource(x, y, W, H);
    const px = sx + ox, py = sy + oy;
    const c = Math.floor(px / pitchX);
    for (const dr of [0, -1]) {
      const r = Math.floor((py - (mod(c, 2) ? pitchY / 2 : 0)) / pitchY) + dr;
      const b = box(c, r);
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b.i;
    }
    return -1;
  };

  // ── Entrance: photos bloom out from the middle of the screen ──
  // Each one grows from a point at its own centre, later the further it is
  // from the middle, while the field glides up into place; titles fade in
  // behind them. grow() is 0 → 1 for a photo whose centre is at (x, y).
  let introAt = -1;
  // The entrance waits for every cover to load (so nothing pops in or changes
  // shape mid-way), or 10 s, whichever comes first; until then nothing shows
  // but a ring filling as the covers arrive (after a moment, so a quick load
  // doesn't flash it)
  let waitingSince = -1;
  const coversLoaded = () => {
    let k = 0;
    for (let i = 0; i < n; i++) if (gallery.aspectOf(i) !== null) k++;
    return k;
  };
  const showLoader = (p: number | null) => {
    const el = opts.loader;
    if (!el) return;
    if (p === null) { el.classList.remove('on'); return; }
    el.hidden = false;
    el.classList.add('on');
    el.style.setProperty('--p', String(p));
    el.querySelector('span')!.textContent = `${Math.round(p * 100)}%`;
  };
  const INTRO = 1.6; // seconds until the furthest photo has landed
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
  const grow = (x: number, y: number) => {
    if (introAt < 0) return 1;
    const t = (performance.now() - introAt) / 1000;
    if (t > INTRO) { introAt = -1; return 1; }
    const d = Math.min(1, Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W / 2, H / 2));
    return easeOut(Math.min(1, Math.max(0, (t - 0.05 - d * 0.55) / 0.9)));
  };
  const start = () => {
    waitingSince = -1;
    if (opts.reduced) return;
    introAt = performance.now();
    // Start a little below and glide up into place
    oy += pitchY * 0.35; vy = -pitchY * 0.35 * 4; vx = 0;
  };
  const intro = () => { introAt = -1; waitingSince = performance.now(); };

  // ── Titles: a pool of spans placed over the photos each frame ──
  const pool: HTMLSpanElement[] = [];
  const placeLabels = (cells: ReturnType<typeof box>[]) => {
    let k = 0;
    for (const b of cells) {
      const [x, y] = lensScreen(b.x + b.w - ox, b.y - oy, W, H);
      if (x < -40 || x > W + 40 || y < -200 || y > H + 40) continue;
      // Where the lens magnifies, the title grows with its photo
      const [x2] = lensScreen(b.x + b.w - ox + 10, b.y - oy, W, H);
      const s = Math.max(1, (x2 - x) / 10);
      let el = pool[k];
      if (!el) { el = pool[k] = document.createElement('span'); labels.append(el); }
      const it = items[b.i], series = it.more?.length ? ` (${it.more.length + 1})` : '';
      const text = (mark[it.kind ?? ''] ?? '') + it.title + series;
      if (el.textContent !== text) el.textContent = text;
      el.style.transform = `translate(${x + 6 * s}px, ${y}px) rotate(90deg) scale(${s}) translateY(-100%)`;
      // During the entrance a title follows its photo in
      const g = grow(b.x + b.w / 2 - ox, b.y + b.h / 2 - oy);
      el.style.opacity = g < 1 ? String(Math.max(0, g * 1.4 - 0.4)) : '';
      el.hidden = false;
      k++;
    }
    for (; k < pool.length; k++) pool[k].hidden = true;
  };

  // ── Input ──
  let dragging = false, moved = 0, lastX = 0, lastY = 0, lastT = 0, hovered = -1, mx = -1, my = -1;
  const setHover = (i: number) => {
    if (i === hovered) return;
    hovered = i;
    canvas.style.cursor = dragging ? 'grabbing' : i >= 0 ? 'pointer' : 'grab';
    window.dispatchEvent(new CustomEvent('cursor:label', { detail: i >= 0 && !dragging ? 'view' : null }));
    opts.onHover(i);
  };
  const ac = new AbortController();
  const on = { signal: ac.signal };
  canvas.addEventListener('pointerdown', (e) => {
    if (!active || e.button !== 0) return;
    dragging = true; moved = 0; vx = vy = 0;
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  }, on);
  canvas.addEventListener('pointermove', (e) => {
    if (!active) return;
    if (e.pointerType === 'mouse') { mx = e.clientX; my = e.clientY; }
    if (!dragging) return;
    const now = performance.now(), dx = e.clientX - lastX, dy = e.clientY - lastY;
    ox -= dx; oy -= dy;
    moved += Math.abs(dx) + Math.abs(dy);
    // Velocity in px/s, smoothed so a slow release doesn't fling
    const k = 1000 / Math.max(8, now - lastT);
    vx = vx * 0.3 + -dx * k * 0.7; vy = vy * 0.3 + -dy * k * 0.7;
    lastX = e.clientX; lastY = e.clientY; lastT = now;
    if (moved > 6) setHover(-1);
  }, on);
  const release = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (performance.now() - lastT > 80) vx = vy = 0; // held still before letting go
    canvas.style.cursor = 'grab';
    if (moved < 6 && e.type === 'pointerup') {
      const i = itemAt(e.clientX, e.clientY);
      if (i >= 0) opts.onOpen(i);
    }
  };
  canvas.addEventListener('pointerup', release, on);
  canvas.addEventListener('pointercancel', release, on);
  canvas.addEventListener('pointerleave', () => { mx = my = -1; if (!dragging) setHover(-1); }, on);
  window.addEventListener('wheel', (e) => {
    if (!active) return;
    const m = e.deltaMode === 1 ? 40 : 1;
    // Shift turns a plain wheel sideways
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
    vx += dx * m * 4; vy += dy * m * 4;
  }, { passive: true, signal: ac.signal });
  window.addEventListener('keydown', (e) => {
    if (!active) return;
    const el = e.target instanceof Element ? e.target : null;
    if (el?.closest('input, textarea, [contenteditable], .lightbox')) return;
    const kick: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const d = kick[e.key];
    if (!d) return;
    e.preventDefault();
    // vel decays at 4/s, so 4 × pitch coasts one cell
    vx += d[0] * pitchX * 4; vy += d[1] * pitchY * 4;
  }, on);

  // ── Frame ──
  const frame = (dt: number, view: unknown) => {
    if (!dragging) {
      ox += vx * dt; oy += vy * dt;
      const f = Math.exp(-4 * dt);
      vx *= f; vy *= f;
      if (Math.hypot(vx, vy) < 1) vx = vy = 0;
    }
    const cells = n ? visible() : [];
    // Hold the entrance until the covers are in
    if (waitingSince >= 0) {
      const k = coversLoaded(), waited = performance.now() - waitingSince;
      if (k >= n || waited > 10000) { showLoader(null); start(); }
      else {
        if (waited > 150) showLoader(k / n);
        gallery.draw(view, [], 0, true); labels.style.opacity = '0'; return;
      }
    }
    labels.style.opacity = '';
    const cards: CardDraw[] = [];
    for (const b of cells) {
      const x = b.x - ox, y = b.y - oy;
      const g = grow(x + b.w / 2, y + b.h / 2);
      if (g <= 0.01) continue;
      // Grow about its centre, rising a touch as it lands
      const w = b.w * g, h = b.h * g;
      cards.push({ tex: b.i, angle: 0, arc: 0, cw: w, ch: h, rect: [x + (b.w - w) / 2, y + (b.h - h) / 2 + (1 - g) * 24, w, h] });
    }
    // Moving fast strengthens the fringe a little
    gallery.draw(view, cards, Math.min(0.01, Math.hypot(vx, vy) * 0.000004), true);
    placeLabels(cells);
    if (!dragging) setHover(mx >= 0 && n ? itemAt(mx, my) : -1);
  };

  return {
    get active() { return active; },
    get dragging() { return dragging; },
    setItems(next: Item[]) {
      items = next; n = next.length;
      if (n) shuffle();
    },
    activate() {
      active = true; measure(); centre();
      labels.hidden = false;
      canvas.style.cursor = 'grab';
      intro();
    },
    /** Play the entrance again (e.g. once the site loader has lifted). */
    intro: () => { if (active) { centre(); intro(); } },
    deactivate() {
      active = false; dragging = false;
      waitingSince = -1; showLoader(null);
      setHover(-1);
      labels.hidden = true;
      canvas.style.cursor = '';
    },
    resize: measure,
    frame,
    destroy: () => { ac.abort(); labels.replaceChildren(); },
  };
}
