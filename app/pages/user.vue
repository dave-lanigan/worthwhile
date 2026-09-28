<script setup lang="ts">
import { ArrowLeft, Check, LoaderCircle, MapPin, ShieldCheck, UserRound } from 'lucide-vue-next'
import { userProfileSchema } from '#shared/schemas/financial-plan'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

const { isSignedIn } = useAuth()
const { user } = useUser()
const guest = !isSignedIn.value
const { profile, saving, saveError, loadError, save } = await useUserProfile(guest)
const form = reactive({ birthDate: '', address: '', taxFilingStatus: 'single' })
const error = ref('')
const saved = ref(false)
const addressSuggestions = ref<{ address: string }[]>([])
const addressLookupError = ref('')
const lookingUpAddress = ref(false)
const selectedAddress = ref('')
let lookupTimer: ReturnType<typeof setTimeout> | undefined
let addressRequest = 0
const displayName = computed(() => guest ? 'Profile settings' : user.value?.fullName || user.value?.firstName || 'Your profile')

watch(profile, (value) => {
  Object.assign(form, { birthDate: value.birthDate, address: value.address, taxFilingStatus: value.taxFilingStatus })
}, { immediate: true })

watch(() => form.address, (value) => {
  clearTimeout(lookupTimer)
  const query = value.trim()
  addressSuggestions.value = []
  addressLookupError.value = ''
  if (query.length < 3 || query === selectedAddress.value) return
  selectedAddress.value = ''
  const request = ++addressRequest
  lookupTimer = setTimeout(async () => {
    lookingUpAddress.value = true
    try {
      const response = await $fetch<{ suggestions: { address: string }[] }>('/api/address', { params: { q: query } })
      if (request === addressRequest) addressSuggestions.value = response.suggestions
    } catch {
      if (request === addressRequest) addressLookupError.value = 'Address suggestions are temporarily unavailable.'
    } finally {
      if (request === addressRequest) lookingUpAddress.value = false
    }
  }, 300)
})

onBeforeUnmount(() => clearTimeout(lookupTimer))

function selectAddress(address: string) {
  selectedAddress.value = address
  addressRequest += 1
  form.address = address
  addressSuggestions.value = []
  addressLookupError.value = ''
}

async function submit() {
  saved.value = false
  const parsed = userProfileSchema.safeParse({ birthDate: form.birthDate, address: form.address, taxFilingStatus: form.taxFilingStatus })
  if (!parsed.success) {
    error.value = parsed.error.issues.map(issue => `${issue.path.join(' ')}: ${issue.message}`).join('. ')
    return
  }
  error.value = ''
  saved.value = await save(parsed.data)
}
</script>

<template>
  <TooltipProvider>
  <main class="profile-page">
    <header class="profile-header"><NuxtLink to="/" class="brand">worthwhile.</NuxtLink><IconButton as-child label="Back to forecast"><NuxtLink to="/"><ArrowLeft :size="18" /></NuxtLink></IconButton></header>
    <Card class="profile-card" role="region" aria-labelledby="profile-title">
      <CardHeader class="profile-card-header">
        <div class="profile-identity"><div class="profile-monogram"><img v-if="!guest && user?.imageUrl" :src="user.imageUrl" :alt="displayName" referrerpolicy="no-referrer"><UserRound v-else :size="25" /></div><div><p class="eyebrow">Account settings</p><h1 id="profile-title">{{ displayName }}</h1><CardDescription class="profile-intro">Details used to personalize your financial plan.</CardDescription></div></div>
      </CardHeader>
      <CardContent>
      <div v-if="guest" class="feedback" role="status"><NuxtLink to="/sign-in" class="underline underline-offset-4">Sign in to save your profile.</NuxtLink></div>
      <div v-else-if="loadError" class="feedback error" role="alert">We could not load your profile. Return to your forecast and try again.</div>
      <form v-else class="entry-form" @submit.prevent="submit">
        <div class="profile-section-heading"><UserRound :size="16" /><div><h2>Personal details</h2><p>Used to tailor your plan.</p></div></div>
        <div class="form-columns"><div class="field"><Label for="profile-birth-date">Birth date</Label><Input id="profile-birth-date" v-model="form.birthDate" type="date" required autocomplete="bday" /></div>
        <div class="field"><Label for="profile-tax-status">Tax filing status</Label><Select v-model="form.taxFilingStatus"><SelectTrigger id="profile-tax-status" class="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single">Single</SelectItem><SelectItem value="married-jointly">Married filing jointly</SelectItem><SelectItem value="married-separately">Married filing separately</SelectItem><SelectItem value="head-of-household">Head of household</SelectItem></SelectContent></Select></div></div>
        <div class="profile-section-heading"><MapPin :size="16" /><div><h2>Home address</h2><p>Used for your tax filing context.</p></div></div>
        <div class="field address-lookup"><Label for="profile-address">Address</Label><Input id="profile-address" v-model="form.address" maxlength="160" required autocomplete="street-address" aria-controls="address-suggestions" :aria-expanded="addressSuggestions.length > 0" placeholder="Start typing your street address" /><p v-if="lookingUpAddress" class="muted" role="status">Finding address matches...</p><p v-else-if="addressLookupError" class="form-error" role="status">{{ addressLookupError }}</p><ul v-if="addressSuggestions.length" id="address-suggestions" class="address-suggestions" role="listbox"><li v-for="suggestion in addressSuggestions" :key="suggestion.address" role="option"><button type="button" @click="selectAddress(suggestion.address)">{{ suggestion.address }}</button></li></ul></div>
        <p v-if="error || saveError" class="form-error" role="alert">{{ error || saveError }}</p>
        <div class="profile-actions"><span v-if="saved" role="status" class="profile-saved"><ShieldCheck :size="16" />Saved</span><IconButton type="submit" variant="default" label="Save profile" :disabled="saving"><LoaderCircle v-if="saving" class="spin" :size="16" /><Check v-else :size="16" /></IconButton></div>
      </form>
      </CardContent>
    </Card>
  </main>
  </TooltipProvider>
</template>
