import tailwindcss from '@tailwindcss/vite'
import { shadcn } from '@clerk/ui/themes'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-27',
  devtools: { enabled: false },
  modules: ['@clerk/nuxt', 'shadcn-nuxt'],
  clerk: {
    signInUrl: '/sign-in',
    signUpUrl: '/sign-up',
    signInFallbackRedirectUrl: '/',
    signUpFallbackRedirectUrl: '/',
    afterSignOutUrl: '/sign-in',
    appearance: { theme: shadcn },
  },
  css: ['~/assets/css/tailwind.css'],
  vite: { plugins: [tailwindcss()] },
  shadcn: { prefix: '', componentDir: './app/components/ui' },
  runtimeConfig: { databasePath: '.data/networth.sqlite', ownerUserId: '' },
  routeRules: { '/': { headers: { 'cache-control': 'private, no-store' } } },
  nitro: { preset: process.env.VERCEL ? 'vercel' : 'node-server' },
  app: { head: { title: 'Worthwhile | Net worth estimator', meta: [{ name: 'description', content: 'Your personal net worth forecast.' }] } },
})