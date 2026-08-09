import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

function devTelemetry(): Plugin {
  return {
    name: 'fennec-dev-telemetry',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(
        '/__fennec/dev-telemetry',
        (request, response, next) => {
          if (request.method !== 'POST') {
            next();
            return;
          }

          let body = '';
          request.setEncoding('utf8');
          request.on('data', (chunk: string) => {
            body += chunk;
            if (body.length > 128_000) request.destroy();
          });
          request.on('end', () => {
            try {
              const payload = JSON.parse(body) as Record<string, unknown>;
              server.config.logger.info(
                `[fennec:feed] ${JSON.stringify(payload)}`,
                { timestamp: true },
              );
              response.statusCode = 204;
              response.end();
            } catch (error) {
              server.config.logger.warn(
                `[fennec:feed] Invalid telemetry payload: ${error instanceof Error ? error.message : String(error)}`,
                { timestamp: true },
              );
              response.statusCode = 400;
              response.end();
            }
          });
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [
    devTelemetry(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['assets/brand/*.svg', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'Fennec — Rocket League Stats',
        short_name: 'Fennec',
        description: 'A local-first Rocket League session dashboard.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#07111f',
        theme_color: '#07111f',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Games', short_name: 'Games', url: '/' },
          { name: 'Setup', short_name: 'Setup', url: '/setup' },
          { name: 'Settings', short_name: 'Settings', url: '/settings' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    css: true,
    globals: true,
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
