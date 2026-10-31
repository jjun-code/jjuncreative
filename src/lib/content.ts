import { createReader } from '@keystatic/core/reader';
import Markdoc from '@markdoc/markdoc';
import keystaticConfig from '../../keystatic.config';

export const reader = createReader(process.cwd(), keystaticConfig);

type Img = { image?: string | null; imageUrl?: string | null } | null | undefined;

/** Prefer an uploaded image, fall back to the old Framer URL. */
export const src = (i: Img, width?: number) => {
  if (!i) return '';
  if (i.image) return i.image;
  if (i.imageUrl) {
    if (!width || !i.imageUrl.includes('framerusercontent.com')) return i.imageUrl;
    const u = new URL(i.imageUrl);
    u.searchParams.set('width', String(width));
    return u.toString();
  }
  return '';
};

export async function getWork() {
  const entries = await reader.collections.work.all();
  return entries
    .map(({ slug, entry }) => ({ slug, ...entry }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (b.year ?? 0) - (a.year ?? 0));
}

export async function renderBody(body: () => Promise<{ node: any }>) {
  const { node } = await body();
  return Markdoc.renderers.html(Markdoc.transform(node));
}

export async function getSite() {
  return (await reader.singletons.site.read())!;
}

/** Pick readable text for a given background colour. */
export function inkOn(hex: string) {
  const h = (hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#1b1d20' : '#f6f6f3';
}
