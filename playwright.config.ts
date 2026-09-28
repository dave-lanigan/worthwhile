import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

if (existsSync('.env')) loadEnvFile('.env')
process.env.CLERK_PUBLISHABLE_KEY = process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY
process.env.CLERK_SECRET_KEY = process.env.NUXT_CLERK_SECRET_KEY
if (!process.env.CLERK_SECRET_KEY?.startsWith('sk_test_')) {
  throw new Error('Browser tests require Clerk development keys.')
}

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4178', trace: 'off', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'node .output/server/index.mjs',
    url: 'http://127.0.0.1:4178/sign-in',
    reuseExistingServer: false,
    env: { HOST: '127.0.0.1', PORT: '4178', NUXT_OWNER_USER_ID: process.env.E2E_CLERK_USER_ID ?? '', NUXT_DATABASE_PATH: join(tmpdir(), `worthwhile-e2e-${randomUUID()}`, 'plan.sqlite') },
  },
})