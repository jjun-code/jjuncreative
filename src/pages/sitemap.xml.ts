// Every public page, for search engines (linked from robots.txt)
import type { APIRoute } from 'astro';
import { getWork } from '../lib/content';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const work = await getWork();
  const paths = ['/', '/about/', ...work.map((w) => `/work/${w.slug}/`)];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site).href}</loc></url>`).join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
};
