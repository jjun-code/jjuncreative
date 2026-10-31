import { gsap } from 'gsap';

export function initCursor() {
  const el = document.querySelector<HTMLElement>('.cursor');
  if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const label = el.querySelector('span')!;
  const x = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3' });
  const y = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3' });
  window.addEventListener('pointermove', (e) => { x(e.clientX); y(e.clientY); });

  // Any element with data-cursor="label" grows the cursor and shows that label.
  document.addEventListener('pointerover', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-cursor]');
    el.classList.toggle('is-view', !!t);
    if (t) label.textContent = t.dataset.cursor || 'view';
  });
  window.addEventListener('cursor:label', ((e: CustomEvent<string | null>) => {
    el.classList.toggle('is-view', !!e.detail);
    if (e.detail) label.textContent = e.detail;
  }) as EventListener);
}
