import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` is overridable so the same build works on GitHub Pages (/HealthApp/)
// or at the root of Netlify / Cloudflare Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
});
