export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/guest') return
  const { isSignedIn } = useAuth()
  if (!isSignedIn.value) return navigateTo('/sign-in')
})