/* The photo field: photos on an endless staggered grid (alternate columns
   dropped by half a row, like brickwork) that the visitor drags around freely,
   with a fisheye at the screen edges (drawn by gallery.ts). The grid never
   ends: cell (c, r) shows photo (c + r·skip) mod n, so any number of photos
   fill it without the same one sitting next to itself. Each photo keeps its
   own shape inside its cell, with its title running up its right edge.
   Only the cells on screen are drawn, so it costs the same with 10 photos or
   1,000. */
import { lensScreen, lensSource, type CardDraw } from './gallery';

type Gallery = { draw: (...a: any[]) => void; aspectOf: (i: number) => number | null };
type Item = { title: string };

export function createPhotoField(opts: {
  canvas: HTMLCanvasElement;
  labels: HTMLElement; // holds the titles
  gallery: Gallery;
  onHover: (i: number) => void; // photo index, or -1
  onOpen: (i: number) => void;
}) {
  const { canvas, labels, gallery } = opts;
  let items: Item[] = [];
  let n = 0, skip = 1;
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
  const itemOf = (c: number, r: number) => mod(c + r * skip, n);
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
      if (el.textContent !== items[b.i].title) el.textContent = items[b.i].title;
      el.style.transform = `translate(${x + 6 * s}px, ${y}px) rotate(90deg) scale(${s}) translateY(-100%)`;
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
    const cards: CardDraw[] = cells.map((b) => ({
      tex: b.i, angle: 0, arc: 0, cw: b.w, ch: b.h, rect: [b.x - ox, b.y - oy, b.w, b.h],
    }));
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
      // Rows step through the photos about 40% of the way round, so a photo's
      // neighbours above and below are far from it in the list
      skip = n > 4 ? Math.max(2, Math.round(n * 0.4)) : 1;
    },
    activate() {
      active = true; measure(); centre();
      labels.hidden = false;
      canvas.style.cursor = 'grab';
    },
    deactivate() {
      active = false; dragging = false;
      setHover(-1);
      labels.hidden = true;
      canvas.style.cursor = '';
    },
    resize: measure,
    frame,
    destroy: () => { ac.abort(); labels.replaceChildren(); },
  };
}
