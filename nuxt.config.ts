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
    afterSignOutUrl: '/',
    appearance: {
      theme: shadcn,
      variables: { colorBackground: '#ffffff' },
      elements: {
        userButtonAvatarBox: { width: '36px', height: '36px' },
        userButtonPopoverCard: { backgroundColor: '#ffffff', opacity: 1, border: '1px solid #e4e4e7', boxShadow: '0 12px 30px rgb(24 24 27 / 0.14)' },
        userButtonPopoverMain: { backgroundColor: '#ffffff', opacity: 1 },
        userButtonPopoverFooter: { backgroundColor: '#ffffff', opacity: 1 },
      },
    },
  },
  css: ['~/assets/css/tailwind.css'],
  vite: { plugins: [tailwindcss()] },
  shadcn: { prefix: '', componentDir: './app/components/ui' },
  runtimeConfig: { databasePath: '.data/networth.sqlite' },
  routeRules: { '/': { headers: { 'cache-control': 'private, no-store' } } },
  nitro: { preset: process.env.VERCEL ? 'vercel' : 'node-server' },
  app: {
    head: {
      title: 'Worthwhile | Net worth estimator',
      meta: [
        { name: 'description', content: 'Your personal net worth forecast.' },
        { name: 'theme-color', content: '#102831' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      ],
      link: [
        { rel: 'manifest', href: '/site.webmanifest' },
        { rel: 'icon', href: '/icons/icon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/icons/icon.svg' },
      ],
    },
  },
})