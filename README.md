# jjuncreative

Portfolio site for Junjie. Astro + Keystatic, hosted on Cloudflare Pages.

- `src/content/` — all editable content (managed through /keystatic)
- `keystatic.config.ts` — the CMS fields
- `src/styles/global.css` — design tokens (colours, fonts, type scale)
- `src/scripts/keyring.ts` — the 3D keyring hero (three.js)
- `src/scripts/home.ts` — scroll interactions (GSAP + Lenis)

Run locally: `npm install && npm run dev`, then open http://localhost:4321 and http://localhost:4321/keystatic.

See SETUP.md for going live.
