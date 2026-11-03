/* Makes casual saving of the site's photos and videos harder: no right-click
   menu and no drag-to-desktop on media (text and links are left alone).
   It can't stop a screenshot or the browser's developer tools; anything a
   browser shows has already been downloaded. Listeners sit on the document,
   so they cover every page after client-side navigation too. */
const MEDIA = 'img, video, picture, canvas.gl, .lb-media';

export function initProtect() {
  const block = (e: Event) => {
    if (e.target instanceof Element && e.target.closest(MEDIA)) e.preventDefault();
  };
  document.addEventListener('contextmenu', block);
  document.addEventListener('dragstart', block);
}
