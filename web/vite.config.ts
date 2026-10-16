/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The ASP.NET Core API serves the built app from its wwwroot (same origin in production).
// In development, Vite proxies API and SignalR calls to the API on :5122.
const api = 'http://localhost:5122'

/**
 * Preloads the two Latin fonts the first screen uses, so text renders in the brand font
 * without a late swap (better first paint, no layout jump).
 */
function preloadFonts(): Plugin {
  const wanted = [/bricolage-grotesque-latin-wght-normal-.*\.woff2$/, /inter-latin-wght-normal-.*\.woff2$/]
  return {
    name: 'preload-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return []
        return Object.keys(ctx.bundle)
          .filter((file) => wanted.some((re) => re.test(file)))
          .map((file) => ({
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' },
            injectTo: 'head',
          }))
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadFonts()],
  build: {
    outDir: '../api/BurChips.Api/wwwroot',
    emptyOutDir: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/hubs': { target: api, ws: true },
    },
  },
})
