<template>
  <main class="auth-screen">
    <h1>worthwhile<span class="brand-period">.</span></h1>
    <SignUp routing="path" path="/sign-up" />
    <Button as-child variant="outline"><NuxtLink to="/guest">Continue without signing in</NuxtLink></Button>
  </main>
</template>
