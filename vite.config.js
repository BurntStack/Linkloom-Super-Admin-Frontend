import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* The Linkloom API sends no CORS headers, so the browser reaches it through a same-origin /api proxy,
   as the website does. In production the host must do the same (see vercel.json). */
const api = {
  '/api': { target: process.env.LINKLOOM_API || 'https://collab-api-ewju.onrender.com', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') }
};

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, proxy: api },
  preview: { port: 5173, proxy: api }
});
