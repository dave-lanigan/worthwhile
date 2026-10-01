<script setup lang="ts">
const { userId } = useAuth()
const route = useRoute()

if (import.meta.client && 'serviceWorker' in navigator) {
  onMounted(() => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Service workers are an enhancement; the app remains usable without one.
    })
  })
}

watch(userId, (current, previous) => {
  if (previous && current !== previous) {
    clearNuxtData()
    navigateTo('/')
  }
})
</script>

<template>
  <NuxtPage :page-key="`${userId ?? 'signed-out'}:${route.path === '/guest' ? 'guest' : 'account'}`" />
</template>