import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

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
  plugins: [devTelemetry(), react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    css: true,
    globals: true,
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
