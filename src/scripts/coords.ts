/* Live cursor position in the top-right corner of the background grid,
   e.g. "0725 X  0453 Y". Desktop with a mouse only (CSS hides it otherwise). */
export function initCoords() {
  const el = document.querySelector<HTMLElement>('.coords');
  if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const x = el.querySelector<HTMLElement>('.cx')!, y = el.querySelector<HTMLElement>('.cy')!;
  let px = 0, py = 0, queued = false;
  const pad = (n: number) => String(Math.max(0, Math.round(n))).padStart(4, '0');
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    px = e.clientX; py = e.clientY;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      x.textContent = pad(px); y.textContent = pad(py);
      el.classList.add('on');
    });
  }, { passive: true });
}
