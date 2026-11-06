import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { devAccountSwitch } from './dev/accountSwitch';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'AWS_');
  const proxy = { '/api': { target: env.AWS_API_TARGET || 'http://127.0.0.1:8000', changeOrigin: true, ws: true } };
  return { plugins: [react(), devAccountSwitch({ target: env.AWS_API_TARGET || 'http://127.0.0.1:8000', username: env.AWS_DEV_SWITCH_USERNAME || '', primaryUsername: '@AllINeedIsYou', password: env.AWS_DEV_SWITCH_PASSWORD || '' })], server: { proxy }, preview: { proxy } };
});
