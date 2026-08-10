import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
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

function landingDocument(): Plugin {
  return {
    name: 'fennec-landing-document',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const document = bundle['landing/index.html'];
      if (!document || document.type !== 'asset') return;
      if (typeof document.source !== 'string') return;
      document.source = document.source.replace(
        '<link rel="manifest" href="/manifest.webmanifest">',
        '',
      );
    },
  };
}

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        landing: fileURLToPath(
          new URL('./landing/index.html', import.meta.url),
        ),
      },
    },
  },
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
        name: 'Fennec',
        short_name: 'Fennec',
        description: 'A local-first Rocket League session dashboard.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        launch_handler: { client_mode: 'navigate-existing' },
        background_color: '#07111f',
        theme_color: '#07111f',
        icons: [
          {
            src: '/icons/icon-192-641d48af76a1.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512-424e32769c63.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
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
    landingDocument(),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    css: true,
    globals: true,
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
