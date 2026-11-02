/* The site navigates without full reloads (Astro's ClientRouter), so a
   component's script only loads once. onPage runs its setup on every page
   view instead: the first load and each navigation after it. A returned
   cleanup runs just before the page is swapped out. */
export function onPage(setup: () => void | (() => void)) {
  document.addEventListener('astro:page-load', () => {
    const cleanup = setup();
    if (cleanup) document.addEventListener('astro:before-swap', cleanup, { once: true });
  });
}
