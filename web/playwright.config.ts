import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against the real API serving the built React app (npm run build first).
 * Uses the locally installed Microsoft Edge, so no browser download is needed.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5122',
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'msedge' } },
    { name: 'desktop', use: { ...devices['Desktop Edge'], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: 'dotnet run --project ../api/BurChips.Api --no-launch-profile --urls http://localhost:5122',
    url: 'http://localhost:5122/api/health',
    reuseExistingServer: true,
    timeout: 180_000,
    env: { ASPNETCORE_ENVIRONMENT: 'Development' },
  },
})
