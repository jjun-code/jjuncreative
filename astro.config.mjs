import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://www.jjuncreative.com',
  output: 'static',
  adapter: cloudflare(),
  integrations: [react(), keystatic()],
  image: {
    domains: ['framerusercontent.com'],
  },
});
