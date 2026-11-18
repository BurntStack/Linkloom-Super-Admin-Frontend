import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_API = 'https://collab-api-ewju.onrender.com';

/* The Linkloom API sends no CORS headers, so the browser reaches it through a same-origin /api proxy,
   as the website does. In production the host must do the same (see vercel.json).
   Settings come from .env, .env.local, .env.[mode] and .env.[mode].local (see .env.example), or the shell. */
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const target = (env.LINKLOOM_API || DEFAULT_API).replace(/\/+$/, '');
  const port = Number(env.PORT) || 5173;
  const api = {
    '/api': { target, changeOrigin: true, secure: true, rewrite: p => p.replace(/^\/api/, '') }
  };
  return {
    base: './',
    plugins: [react()],
    server: { port, proxy: api },
    preview: { port, proxy: api }
  };
});
