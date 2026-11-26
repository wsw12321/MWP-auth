import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { sitesPath } from './src/lib/sites'
import { sitesResponse } from './worker/sites'

function localSitesApi(): Plugin {
  return {
    name: 'local-sites-api',
    configureServer(server) {
      const { mode, envDir } = server.config
      const { CONNECTED_SITES } = loadEnv(mode, envDir, 'CONNECTED_SITES')
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== sitesPath) return next()
        const result = sitesResponse(request.method ?? 'GET', CONNECTED_SITES)
        response.writeHead(result.status, Object.fromEntries(result.headers))
        response.end(await result.text())
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localSitesApi()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    clearMocks: true,
    restoreMocks: true,
  },
})
