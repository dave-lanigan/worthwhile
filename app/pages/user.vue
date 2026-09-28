<script setup lang="ts">
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Check, ChevronRight, Landmark, LoaderCircle, MapPin, Pencil, Plus, ShieldCheck, Trash2, TrendingUp, UserRound } from 'lucide-vue-next'
import { investmentAllocation, userProfileSchema, type CashFlow, type Category, type Investment, type Liability } from '#shared/schemas/financial-plan'
import { monthlyAmount } from '#shared/utils/projection'
import { money } from '@/lib/format'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

const { isSignedIn } = useAuth()
const { user } = useUser()
const route = useRoute()
const guest = !isSignedIn.value
const { profile, saving, saveError, loadError, save } = await useUserProfile(guest)
const { draft: plan, saving: planSaving, saveError: planSaveError, loadError: planLoadError, forecast: planForecast, activeProfile: planActiveProfile, selectProfile: selectPlanProfile } = await useFinancialPlan(guest)
if (!guest) {
  const requestedProfile = route.query.profile
  if (typeof requestedProfile === 'string' && requestedProfile && requestedProfile !== planActiveProfile.value?.id) {
    try { await selectPlanProfile(requestedProfile) } catch { /* keep the personal forecast plan */ }
  }
}
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

const activeCategory = ref<Category>('incomes')
const editorOpen = ref(false)
const editing = ref<CashFlow | Investment | Liability>()
const deleting = ref<CashFlow | Investment | Liability>()
const deleteOpen = ref(false)
const categories = [
  { key: 'incomes' as const, label: 'Income', singular: 'income', icon: ArrowDownLeft },
  { key: 'investments' as const, label: 'Investments', singular: 'investment', icon: TrendingUp },
  { key: 'expenses' as const, label: 'Expenses', singular: 'expense', icon: ArrowUpRight },
  { key: 'liabilities' as const, label: 'Liabilities', singular: 'liability', icon: Landmark },
]
const currentCategory = computed(() => categories.find(category => category.key === activeCategory.value)!)
const entries = computed(() => plan.value[activeCategory.value])
const totalInvested = computed(() => plan.value.investments.reduce((total, item) => total + item.balance, 0))
const totalDebt = computed(() => plan.value.liabilities.reduce((total, item) => total + item.balance, 0))
const categoryTotals = computed(() => ({ incomes: planForecast.value.result?.income ?? 0, investments: totalInvested.value, expenses: planForecast.value.result?.expenses ?? 0, liabilities: totalDebt.value }))
const fixedMonthly = computed(() => plan.value.investments.reduce((total, item) => total + (item.monthlyContribution ?? 0), 0))

function allocationLabel(investment: Investment) {
  return investment.monthlyContribution !== undefined
    ? `${money(investment.monthlyContribution, true)} / month`
    : `${investmentAllocation(investment, plan.value.investments).toLocaleString('en-US', { maximumFractionDigits: 2 })}%${fixedMonthly.value ? ' of remainder' : ''}`
}
function preserveAllocations() {
  const investments = plan.value.investments
  const allocations = investments.map(item => investmentAllocation(item, investments))
  investments.forEach((item, index) => { if (item.monthlyContribution === undefined) item.allocation = allocations[index]! })
}
function edit(entry?: CashFlow | Investment | Liability) {
  editing.value = entry
  editorOpen.value = true
}
function storeEntry(entry: CashFlow | Investment | Liability) {
  if (activeCategory.value === 'investments') preserveAllocations()
  const items = plan.value[activeCategory.value] as (CashFlow | Investment | Liability)[]
  const index = items.findIndex(item => item.id === entry.id)
  if (index < 0) items.push(entry)
  else items[index] = entry
}
function confirmDelete(entry: CashFlow | Investment | Liability) {
  deleting.value = entry
  deleteOpen.value = true
}
function removeEntry() {
  if (activeCategory.value === 'investments') preserveAllocations()
  const items = plan.value[activeCategory.value]
  const index = items.findIndex(item => item.id === deleting.value?.id)
  if (index >= 0) items.splice(index, 1)
}

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
        <div class="profile-identity"><div class="profile-monogram"><img v-if="!guest && user?.imageUrl" :src="user.imageUrl" :alt="displayName" referrerpolicy="no-referrer"><UserRound v-else :size="25" /></div><div><p class="eyebrow">Account settings</p><h1 id="profile-title">{{ displayName }}</h1><CardDescription class="profile-intro">Details used to personalize your financial plan.</CardDescription><NuxtLink v-if="!guest" to="/profiles" class="profiles-link">Manage scenario profiles<ChevronRight :size="14" /></NuxtLink></div></div>
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
    <Card v-if="!guest && !planLoadError" class="financial-section" role="region" aria-labelledby="settings-financial-title">
      <CardHeader class="section-heading">
        <div class="section-title"><h2 id="settings-financial-title">Income, investments &amp; debts</h2><CardDescription>{{ planActiveProfile ? `Editing “${planActiveProfile.name}”` : 'Editing your personal forecast' }}</CardDescription></div>
      </CardHeader>
      <CardContent>
        <Tabs v-model="activeCategory" class="financial-tabs">
          <TabsList class="category-rail" aria-label="Financial categories"><TabsTrigger v-for="category in categories" :key="category.key" :value="category.key" class="category-rail-item"><span class="category-rail-label"><component :is="category.icon" :size="16" /><span>{{ category.label }}</span><span class="entry-count">{{ plan[category.key].length }}</span></span><span class="category-rail-total">{{ money(categoryTotals[category.key]) }}</span></TabsTrigger></TabsList>
          <div class="ledger-toolbar"><div><h3>{{ currentCategory.label }}</h3><span class="muted">{{ activeCategory === 'incomes' || activeCategory === 'expenses' ? 'Monthly total' : 'Current balance' }}: {{ money(categoryTotals[activeCategory]) }}</span></div><IconButton variant="default" :label="`Add ${currentCategory.singular}`" @click="edit()"><Plus :size="18" /></IconButton></div>
          <Table v-if="entries.length" class="ledger-table" role="table">
            <TableCaption class="sr-only">{{ currentCategory.label }} entries</TableCaption>
            <TableHeader role="rowgroup"><TableRow role="row"><TableHead role="columnheader">Name</TableHead><TableHead role="columnheader" class="text-right">{{ activeCategory === 'incomes' || activeCategory === 'expenses' ? 'Amount' : 'Current balance' }}</TableHead><TableHead role="columnheader">{{ activeCategory === 'investments' ? 'Annual ROI' : activeCategory === 'liabilities' ? 'Interest APR' : 'Frequency' }}</TableHead><TableHead role="columnheader" class="text-right">{{ activeCategory === 'investments' ? 'Surplus allocation' : activeCategory === 'liabilities' ? 'Monthly payment' : 'Monthly total' }}</TableHead><TableHead role="columnheader"><span class="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody role="rowgroup">
              <TableRow v-for="entry in entries" :key="entry.id" role="row">
                <TableCell role="cell"><div class="entry-name"><span class="entry-icon" :class="activeCategory"><component :is="currentCategory.icon" :size="16" /></span><span>{{ entry.name }}</span></div></TableCell>
                <TableCell role="cell" :data-label="'amount' in entry ? 'Amount' : 'Current balance'" class="text-right tabular-nums">{{ money('amount' in entry ? entry.amount : entry.balance, true) }}</TableCell>
                <TableCell role="cell" :data-label="'frequency' in entry ? 'Frequency' : 'annualRoi' in entry ? 'Annual ROI' : 'Interest APR'"><span v-if="'frequency' in entry" class="frequency-tag">{{ entry.frequency === 'annual' ? 'Annual' : 'Monthly' }}</span><span v-else-if="'annualRoi' in entry" class="rate">{{ entry.annualRoi }}%</span><span v-else>{{ entry.apr }}%</span></TableCell>
                <TableCell role="cell" :data-label="'amount' in entry ? 'Monthly total' : 'annualRoi' in entry ? 'Surplus allocation' : 'Monthly payment'" class="text-right tabular-nums">{{ 'amount' in entry ? money(monthlyAmount(entry), true) : 'annualRoi' in entry ? allocationLabel(entry) : money(entry.payment, true) }}</TableCell>
                <TableCell role="cell"><div class="row-actions"><Tooltip><TooltipTrigger as-child><Button variant="ghost" size="icon" :aria-label="`Edit ${entry.name}`" @click="edit(entry)"><Pencil :size="15" /></Button></TooltipTrigger><TooltipContent>Edit {{ entry.name }}</TooltipContent></Tooltip><Tooltip><TooltipTrigger as-child><Button variant="ghost" size="icon" :aria-label="`Delete ${entry.name}`" @click="confirmDelete(entry)"><Trash2 :size="15" /></Button></TooltipTrigger><TooltipContent>Delete {{ entry.name }}</TooltipContent></Tooltip></div></TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div v-else class="empty-ledger"><span class="empty-icon"><component :is="currentCategory.icon" :size="23" /></span><h3>No {{ activeCategory === 'incomes' ? 'income sources' : currentCategory.label.toLowerCase() }} yet</h3><Button variant="link" @click="edit()"><Plus :size="15" />Add your first {{ currentCategory.singular }}</Button></div>
        </Tabs>
        <p v-if="planSaveError" class="form-error" role="alert">{{ planSaveError }}</p>
        <span v-else-if="planSaving" class="save-state" role="status"><LoaderCircle class="spin" :size="14" />Saving...</span>
      </CardContent>
    </Card>
    <FinancialEntryDialog v-model:open="editorOpen" :category="activeCategory" :entry="editing" :investments="plan.investments" @save="storeEntry" />
    <AlertDialog v-model:open="deleteOpen"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {{ deleting?.name }}?</AlertDialogTitle><AlertDialogDescription>This removes the entry from your forecast.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction @click="removeEntry"><Trash2 :size="15" />Delete entry</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>
  </TooltipProvider>
</template>
