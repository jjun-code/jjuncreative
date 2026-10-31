import { gsap, ScrollTrigger, reduced } from './smooth';
import type { Charm } from './keyring';

export async function initHome() {
  const rm = reduced();
  heroIntro(rm);
  cycleWords(rm);
  marquee(rm);
  doesSection();
  featured(rm);
  await keyring(rm);
}

/* One orchestrated load: headline lines rise in. */
function heroIntro(rm: boolean) {
  if (rm) return;
  gsap.from('.headline .line', { yPercent: 110, duration: 1.2, ease: 'expo.out', stagger: 0.12, delay: 0.2 });
  gsap.from('.keyring', { opacity: 0, y: -60, duration: 1.6, ease: 'expo.out' });
}

/* "design led by <word>" — letters scramble into the next word. */
function cycleWords(rm: boolean) {
  const el = document.querySelector<HTMLElement>('.cycle');
  if (!el) return;
  const words: string[] = JSON.parse(el.dataset.words || '[]');
  if (words.length < 2) return;
  let i = 0;
  const glyphs = 'abcdefghijklmnopqrstuvwxyz⬩';
  const swap = (to: string) => {
    if (rm) { el.textContent = to; return; }
    const from = el.textContent || '';
    const len = Math.max(from.length, to.length);
    const state = { p: 0 };
    gsap.to(state, {
      p: 1, duration: 0.7, ease: 'power2.out',
      onUpdate: () => {
        const settled = Math.floor(state.p * len);
        let out = '';
        for (let k = 0; k < len; k++) {
          if (k < settled) out += to[k] ?? '';
          else if (k < to.length) out += glyphs[(Math.random() * glyphs.length) | 0];
        }
        el.textContent = out;
      },
      onComplete: () => (el.textContent = to),
    });
  };
  setInterval(() => { i = (i + 1) % words.length; swap(words[i]); }, 2600);
}

/* Marquee drifts on its own and speeds up with scroll velocity. */
function marquee(rm: boolean) {
  const track = document.querySelector<HTMLElement>('.marquee-track');
  if (!track || rm) return;
  const half = () => track.scrollWidth / 2;
  let x = 0, boost = 0, dir = -1;
  ScrollTrigger.create({
    trigger: '.marquee', start: 'top bottom', end: 'bottom top',
    onUpdate: (self) => { boost = Math.min(Math.abs(self.getVelocity()) / 60, 25); dir = self.direction === 1 ? -1 : 1; },
  });
  gsap.ticker.add((_, dt) => {
    x += dir * (0.6 + boost) * (dt / 16);
    boost *= 0.92;
    const h = half();
    if (x <= -h) x += h;
    if (x > 0) x -= h;
    track.style.transform = `translate3d(${x}px,0,0)`;
  });
}

/* Pinned about: the word changes with scroll position. */
function doesSection() {
  const sec = document.querySelector<HTMLElement>('.does');
  const text = sec?.querySelector<HTMLElement>('.does-text');
  const ticks = sec ? [...sec.querySelectorAll<HTMLElement>('.does-ticks li')] : [];
  if (!sec || !text || !ticks.length) return;
  const words = ticks.map((t) => t.textContent || '');
  let current = -1;
  const set = (i: number) => {
    if (i === current) return;
    current = i;
    ticks.forEach((t, k) => t.classList.toggle('on', k === i));
    gsap.fromTo(text, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.45, ease: 'power3.out', onStart: () => { text.textContent = words[i]; } });
  };
  set(0);
  ScrollTrigger.create({
    trigger: sec, start: 'top top', end: 'bottom bottom',
    onUpdate: (s) => set(Math.min(words.length - 1, Math.floor(s.progress * words.length))),
  });
}

/* Featured: vertical scroll drives a horizontal track. Images drift for depth. */
function featured(rm: boolean) {
  const sec = document.querySelector<HTMLElement>('.featured');
  const track = sec?.querySelector<HTMLElement>('.featured-track');
  if (!sec || !track) return;
  const mm = gsap.matchMedia();
  mm.add('(min-width: 861px)', () => {
    const dist = () => track.scrollWidth - window.innerWidth;
    const tween = gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: rm ? true : 0.8, invalidateOnRefresh: true },
    });
    if (!rm) {
      sec.querySelectorAll<HTMLElement>('.c').forEach((fig, i) => {
        gsap.fromTo(fig.querySelector('img'), { xPercent: -6 }, {
          xPercent: 6, ease: 'none',
          scrollTrigger: { trigger: fig, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
        });
        if (i % 3) gsap.fromTo(fig, { y: 40 }, { y: -40, ease: 'none', scrollTrigger: { trigger: fig, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
      });
    }
  });
}

async function keyring(rm: boolean) {
  const canvas = document.querySelector<HTMLCanvasElement>('.keyring');
  const data = document.getElementById('charms');
  if (!canvas || !data) return;
  const charms: Charm[] = JSON.parse(data.textContent || '[]');
  const caption = document.querySelector<HTMLElement>('.hover-caption');

  let ctl: Awaited<ReturnType<typeof import('./keyring').mountKeyring>>;
  try {
    const { mountKeyring } = await import('./keyring');
    ctl = await mountKeyring(canvas, charms, {
      reduced: rm,
      onHover: (c) => {
        window.dispatchEvent(new CustomEvent('cursor:label', { detail: c ? 'open' : null }));
        if (!caption) return;
        caption.classList.toggle('on', !!c);
        if (c) caption.textContent = `${c.title.toLowerCase()}, ${c.year}`;
      },
    });
  } catch (e) {
    console.warn('Keyring unavailable', e);
    canvas.remove();
    return;
  }

  ScrollTrigger.create({
    trigger: '.hero', start: 'top top', end: 'bottom top',
    onUpdate: (s) => ctl.setScroll(s.progress),
    onToggle: (s) => ctl.setRunning(s.isActive),
  });
  ctl.setRunning(true);

  document.querySelectorAll<HTMLElement>('[data-charm]').forEach((a) => {
    const i = Number(a.dataset.charm);
    a.addEventListener('pointerenter', () => ctl.poke(i));
    a.addEventListener('focus', () => ctl.poke(i));
  });
}
