import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lenis: Lenis | null = null;

export function initSmooth() {
  // Between pages: drop the old page's scroll animations, start the new page
  // at the top (with scrolling back on, in case the menu had paused it)
  document.addEventListener('astro:before-swap', () => ScrollTrigger.getAll().forEach((t) => t.kill()));
  document.addEventListener('astro:after-swap', () => {
    lenis?.scrollTo(0, { immediate: true, force: true });
    lenis?.start();
  });
  document.addEventListener('astro:page-load', () => { lenis?.resize(); ScrollTrigger.refresh(); });

  if (reduced() || lenis) return;
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis!.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

export const getLenis = () => lenis;
export { gsap, ScrollTrigger };
