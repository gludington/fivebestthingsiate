// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://fivebestthingsiate.loodingdongs.com',
  output: 'server',
  adapter: cloudflare({
    // Photos are served straight from R2; no Cloudflare Images binding needed.
    imageService: 'passthrough',
  }),
  // Auth sessions live in D1 (src/lib/auth.ts), so skip Astro's KV-backed sessions.
  session: false,
  vite: {
    plugins: [tailwindcss()],
  },
});
