/* Size every .giant wordmark so it spans its container exactly. */
export function initFit() {
  const fit = () => {
    document.querySelectorAll<HTMLElement>('.giant').forEach((el) => {
      const box = el.parentElement;
      if (!box) return;
      const cs = getComputedStyle(box);
      const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      el.style.fontSize = '100px';
      el.style.fontSize = `${(100 * avail) / el.scrollWidth}px`;
    });
  };
  document.fonts.ready.then(fit);
  window.addEventListener('resize', fit);
  fit();
}
