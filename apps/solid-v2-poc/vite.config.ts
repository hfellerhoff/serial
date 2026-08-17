import solid from '@solidjs/vite-plugin';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { defineConfig, loadEnv } from 'vite';

const DEFAULT_SERIAL_BACKEND_URL = 'http://localhost:3000';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl =
    env.SERIAL_SOLID_POC_BACKEND_URL ?? DEFAULT_SERIAL_BACKEND_URL;

  return {
    plugins: [
      tanstackRouter({ target: 'solid', autoCodeSplitting: true }),
      solid({ start: true }),
    ],
    server: {
      host: '0.0.0.0',
      port: 3001,
      strictPort: true,
      proxy: {
        '/api/rpc': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'esnext',
    },
  };
});
