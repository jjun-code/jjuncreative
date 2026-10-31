import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';

// Keystatic's local editor writes to disk, which the workerd dev runtime can't do,
// so `astro dev` runs on Node and builds target Cloudflare.
const isDev = process.argv.includes('dev');

export default defineConfig({
  site: 'https://www.jjuncreative.com',
  output: 'static',
  adapter: isDev
    ? node({ mode: 'standalone' })
    : // Pages read content files from disk at build time, so prerender in Node rather than workerd.
      // The site doesn't use astro:assets, so no runtime image endpoint is needed.
      cloudflare({ prerenderEnvironment: 'node', imageService: 'passthrough' }),
  integrations: [react(), keystatic()],
  image: {
    domains: ['framerusercontent.com'],
  },
});
