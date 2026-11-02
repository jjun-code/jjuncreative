import { mountPixels } from './pixels';
import { reduced } from './smooth';

/* Fixed pixel field behind every page. Its dot colour comes from the
   --dither token, so it follows the light/dark theme. */
export function initBackdrop() {
  const canvas = document.querySelector<HTMLCanvasElement>('.backdrop');
  if (!canvas) return;
  let ctl: ReturnType<typeof mountPixels>;
  try {
    ctl = mountPixels(canvas, { reduced: reduced() });
  } catch (e) {
    console.warn('Pixel background unavailable', e);
    canvas.remove();
    return;
  }
  const applyInk = () => {
    const [r, g, b] = getComputedStyle(document.documentElement).getPropertyValue('--dither').split(',').map((v) => Number(v) / 255);
    ctl.setInk(r, g, b);
  };
  applyInk();
  window.addEventListener('themechange', applyInk);
  ctl.setRunning(true);
}
