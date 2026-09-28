<script setup lang="ts">
const { userId } = useAuth()
const route = useRoute()
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