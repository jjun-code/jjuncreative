/* Full-screen pixel veil in the page colour, cleared cell by cell in an
   ordered-dither sweep. Used by the loader (to reveal the site) and the menu
   (to cover the page). A low-res canvas, scaled up with crisp pixels. */

type From = 'bottom-left' | 'top-right';

// 8×8 ordered dither threshold, 0..1, built up from the 2×2 matrix
const b2 = (x: number, y: number) => { x = Math.floor(x); y = Math.floor(y); return (x / 2 + y * y * 0.75) % 1; };
const b4 = (x: number, y: number) => b2(x / 2, y / 2) * 0.25 + b2(x, y);
const bayer = (x: number, y: number) => (b4(x / 2, y / 2) * 0.25 + b2(x, y)) % 1;

export function makeVeil(canvas: HTMLCanvasElement, { cell = 10, from = 'bottom-left' as From } = {}) {
  const ctx = canvas.getContext('2d')!;
  let cw = 0, ch = 0, img: ImageData, rgb = [20, 20, 20], last = 0;

  const size = () => {
    cw = Math.ceil(window.innerWidth / cell); ch = Math.ceil(window.innerHeight / cell);
    canvas.width = cw; canvas.height = ch;
    img = ctx.createImageData(cw, ch);
    // The canvas normalises any colour (the published CSS shortens #ffffff to
    // #fff) to #rrggbb, which is then read as numbers
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#141414';
    const m = String(ctx.fillStyle).match(/^#([0-9a-f]{6})$/i);
    if (m) rgb = [0, 2, 4].map((o) => parseInt(m[1].slice(o, o + 2), 16));
    draw(last);
  };

  /** t = 0: fully covered; t = 1: fully clear. Cells clear along a diagonal
      sweep from the `from` corner, broken up by the dither pattern. */
  function draw(t: number) {
    last = t;
    const d = img.data;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const sweep = from === 'bottom-left'
          ? (x / cw) * 0.5 + (1 - y / ch) * 0.5
          : (1 - x / cw) * 0.5 + (y / ch) * 0.5;
        const th = sweep * 0.55 + bayer(x & 7, y & 7) * 0.45;
        const o = (y * cw + x) * 4;
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2];
        d[o + 3] = th >= t * 1.02 ? 255 : 0;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  size();
  window.addEventListener('resize', size);
  window.addEventListener('themechange', size);
  return { draw, size };
}
