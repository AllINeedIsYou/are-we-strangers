import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'AWS_');
  const proxy = { '/api': { target: env.AWS_API_TARGET || 'http://127.0.0.1:8000', changeOrigin: true } };
  return { plugins: [react()], server: { proxy }, preview: { proxy } };
});
