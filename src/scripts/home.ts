import { gsap, ScrollTrigger, reduced } from './smooth';
import { mountHalftone } from './halftone';

export function initHome() {
  const rm = reduced();
  heroIntro(rm);
  halftone(rm);
  cycleWords(rm);
  orbit(rm);
}

/* One orchestrated load: wordmark letters rise, then the copy follows. */
function heroIntro(rm: boolean) {
  if (rm) return;
  const tl = gsap.timeline({ delay: 0.1, defaults: { ease: 'expo.out' } });
  tl.from('.hero-bg', { opacity: 0, duration: 1.6, ease: 'power2.out' }, 0)
    .from('.wordmark .ch', { yPercent: 105, duration: 1.3, stagger: 0.035 }, 0.1)
    .from('.headline', { y: 30, opacity: 0, filter: 'blur(8px)', duration: 1.4 }, 0.35)
    .from('.hero-cta .stat, .hero-cta .buttons > *', { y: 20, opacity: 0, duration: 1, stagger: 0.07 }, 0.45)
    .from('.hero-foot .rule', { scaleX: 0, transformOrigin: 'left', duration: 1.4, ease: 'expo.inOut' }, 0);
}

function halftone(rm: boolean) {
  const canvas = document.querySelector<HTMLCanvasElement>('.halftone');
  if (!canvas) return;
  let ctl: ReturnType<typeof mountHalftone>;
  try {
    ctl = mountHalftone(canvas, { reduced: rm });
  } catch (e) {
    console.warn('Halftone unavailable', e);
    canvas.remove();
    return;
  }
  ScrollTrigger.create({
    trigger: '.hero', start: 'top top', end: 'bottom top',
    onToggle: (s) => ctl.setRunning(s.isActive),
  });
  ctl.setRunning(true);
}

/* "Design led by <word>": the word rolls up to the next one. */
function cycleWords(rm: boolean) {
  const box = document.querySelector<HTMLElement>('.cycle');
  const el = box?.querySelector<HTMLElement>('span');
  if (!box || !el) return;
  const words: string[] = JSON.parse(box.dataset.words || '[]');
  if (words.length < 2) return;
  let i = 0;
  setInterval(() => {
    i = (i + 1) % words.length;
    if (rm) { el.textContent = words[i]; return; }
    gsap.timeline()
      .to(el, { yPercent: -110, duration: 0.45, ease: 'power3.in' })
      .add(() => { el.textContent = words[i]; })
      .fromTo(el, { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: 'expo.out' });
  }, 3200);
}

/* Featured images sit on a ring that turns as you scroll past the headline. */
function orbit(rm: boolean) {
  const sec = document.querySelector<HTMLElement>('.orbit');
  const cards = sec ? [...sec.querySelectorAll<HTMLElement>('.o-card')] : [];
  if (!sec || !cards.length) return;

  const mm = gsap.matchMedia();
  mm.add('(min-width: 761px)', () => {
    if (rm) { document.documentElement.classList.add('no-orbit'); return; }
    const n = cards.length;
    const step = (Math.PI * 2) / n;
    // Each card gets its own height so the ring reads as loose, not mechanical
    const lift = cards.map((_, i) => Math.sin(i * 2.399) * 0.22);
    const state = { turn: 0 };

    const render = () => {
      const R = Math.min(window.innerWidth * 0.42, 720);
      const H = window.innerHeight;
      cards.forEach((card, i) => {
        const a = i * step - state.turn;
        const x = Math.sin(a) * R;
        const z = Math.cos(a) * R - R * 0.55;
        const front = Math.cos(a); // 1 facing us, -1 behind the headline
        card.style.transform = `translate3d(${x}px, ${lift[i] * H}px, ${z}px) rotateY(${(a * 180) / Math.PI}deg)`;
        card.style.opacity = String(Math.max(0, Math.min(1, (front + 0.55) * 1.4)));
        card.style.zIndex = String(Math.round((front + 1) * 50));
        card.style.pointerEvents = front > 0.3 ? 'auto' : 'none';
      });
    };

    const tween = gsap.to(state, {
      turn: Math.PI * 2 - step, ease: 'none', onUpdate: render,
      scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom bottom', scrub: 0.8 },
    });
    render();
    window.addEventListener('resize', render);
    return () => {
      tween.kill();
      window.removeEventListener('resize', render);
      cards.forEach((c) => c.removeAttribute('style'));
    };
  });
  mm.add('(max-width: 760px)', () => {
    document.documentElement.classList.add('no-orbit');
    return () => document.documentElement.classList.remove('no-orbit');
  });
}
