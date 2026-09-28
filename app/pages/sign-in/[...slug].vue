<template>
  <main class="auth-screen">
    <h1>worthwhile<span class="brand-period">.</span></h1>
    <SignIn routing="path" path="/sign-in" />
    <Button as-child variant="outline"><NuxtLink to="/guest">Continue without signing in</NuxtLink></Button>
  </main>
</template>
