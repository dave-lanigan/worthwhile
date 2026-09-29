<script setup lang="ts">
import { ArrowDownLeft, ArrowUpRight, BookmarkPlus, ChartNoAxesCombined, ChevronRight, CircleAlert, Dices, EllipsisVertical, Landmark, Layers, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, TrendingUp, UserRound, Wallet } from 'lucide-vue-next'
import { DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from 'reka-ui'
import { emptyPlan, investmentAllocation, type CashFlow, type Category, type Investment, type Liability } from '#shared/schemas/financial-plan'
import { annualAmount, monthlyAmount, simulateNetWorth } from '#shared/utils/projection'
import { netWorthPercentile, percentileLabel, WEALTH_BENCHMARK } from '#shared/utils/wealth-percentile'
import { money, monthLabel } from '@/lib/format'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { NumberField, NumberFieldContent, NumberFieldDecrement, NumberFieldIncrement, NumberFieldInput } from '@/components/ui/number-field'

definePageMeta({ alias: '/guest' })
const { isSignedIn } = useAuth()
const { user } = useUser()
const route = useRoute()
const guest = route.path === '/guest' || !isSignedIn.value
const showExample = route.path !== '/guest' && !isSignedIn.value
const exampleCleared = ref(false)
const greetingIndex = ref(0)
const greetings = ['Let’s get wealthy.', 'Your future is worth planning for.', 'Small moves build real wealth.']
const firstName = computed(() => user.value?.firstName || user.value?.fullName?.split(' ')[0] || 'there')
const greeting = computed(() => greetings[greetingIndex.value]!)
const settingsLink = computed(() => activeProfile.value ? `/user?profile=${activeProfile.value.id}` : '/user')
let greetingTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => { greetingTimer = setInterval(() => { greetingIndex.value = (greetingIndex.value + 1) % greetings.length }, 7 * 24 * 60 * 60 * 1000) })
onBeforeUnmount(() => clearInterval(greetingTimer))
const { draft, dirty, saving, saveError, conflict, loadError, status, forecast, activeProfile, profiles, selectProfile, createProfile, save, clear, reload } = await useFinancialPlan(guest, showExample)
const start = useState('forecast-start', () => new Date().toISOString().slice(0, 7))
const activeCategory = ref<Category>('incomes')
const editorOpen = ref(false)
const editing = ref<CashFlow | Investment | Liability>()
const deleting = ref<CashFlow | Investment | Liability>()
const deleteOpen = ref(false)
const reloadOpen = ref(false)
const clearOpen = ref(false)
const profileDialogOpen = ref(false)
const profileDialogMode = ref<'copy' | 'new'>('copy')
const profileName = ref('')
const profileDescription = ref('')
const profileError = ref('')
const creatingProfile = ref(false)
const selectedMonth = ref(draft.value.years * 12)
const forecastMode = ref<'deterministic' | 'monte-carlo'>('deterministic')
const portfolioPreset = ref('conservative')
const portfolioMean = ref(5)
const portfolioVolatility = ref(10)
const portfolioPresets = { conservative: { mean: 5, volatility: 10 }, aggressive: { mean: 8, volatility: 18 } }
const categories = [
  { key: 'incomes' as const, label: 'Income', singular: 'income', icon: ArrowDownLeft },
  { key: 'investments' as const, label: 'Investments', singular: 'investment', icon: TrendingUp },
  { key: 'expenses' as const, label: 'Expenses', singular: 'expense', icon: ArrowUpRight },
  { key: 'liabilities' as const, label: 'Liabilities', singular: 'liability', icon: Landmark },
]
const currentCategory = computed(() => categories.find(category => category.key === activeCategory.value)!)
const entries = computed(() => draft.value[activeCategory.value])
const first = computed(() => forecast.value.result?.points[0])
const selected = computed(() => forecast.value.result?.points[Math.min(selectedMonth.value, draft.value.years * 12)] ?? first.value)
const currentPercentile = computed(() => percentileLabel(first.value ? netWorthPercentile(first.value.netWorth) : null))
const selectedPercentile = computed(() => percentileLabel(selected.value ? netWorthPercentile(selected.value.netWorth) : null))
const compactPercentile = (label: string) => label.replace('Approx. ', '')
const compactMoney = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(amount / 100)
const yearlyIncome = computed(() => draft.value.incomes.reduce((total, income) => total + annualAmount(income), 0))
const selectedPeriod = computed(() => {
  const month = selected.value?.month ?? 0
  if (!month) return 'Today'
  const years = Math.floor(month / 12)
  const months = month % 12
  return [years ? `${years} ${years === 1 ? 'year' : 'years'}` : '', months ? `${months} ${months === 1 ? 'month' : 'months'}` : ''].filter(Boolean).join(' ')
})
const monthlyPayments = computed(() => forecast.value.result?.points[1]?.payments ?? 0)
const monthlySurplus = computed(() => (forecast.value.result?.income ?? 0) - (forecast.value.result?.expenses ?? 0) - monthlyPayments.value)
const totalInvested = computed(() => draft.value.investments.reduce((total, item) => total + item.balance, 0))
const totalDebt = computed(() => draft.value.liabilities.reduce((total, item) => total + item.balance, 0))
const categoryTotals = computed(() => ({ incomes: forecast.value.result?.income ?? 0, investments: totalInvested.value, expenses: forecast.value.result?.expenses ?? 0, liabilities: totalDebt.value }))
const growth = computed(() => (selected.value?.netWorth ?? 0) - (first.value?.netWorth ?? 0))
const simulation = computed(() => forecastMode.value === 'monte-carlo' && forecast.value.result
  ? simulateNetWorth(draft.value, { annualReturn: portfolioMean.value, annualVolatility: portfolioVolatility.value })
  : null)
const simulationProbability = computed(() => simulation.value ? Math.round(simulation.value.probability * 100) : 0)
const simulationTarget = computed(() => simulation.value ? compactMoney(simulation.value.target) : '$1M')
const cashAllocation = computed(() => Math.max(0, 100 - draft.value.investments.reduce((total, item) => total + investmentAllocation(item, draft.value.investments), 0)))
const fixedMonthly = computed(() => draft.value.investments.reduce((total, item) => total + (item.monthlyContribution ?? 0), 0))

function allocationLabel(investment: Investment) {
  return investment.monthlyContribution !== undefined
    ? `${money(investment.monthlyContribution, true)} / month`
    : `${investmentAllocation(investment, draft.value.investments).toLocaleString('en-US', { maximumFractionDigits: 2 })}%${fixedMonthly.value ? ' of remainder' : ''}`
}

function preserveAllocations() {
  const investments = draft.value.investments
  const allocations = investments.map(item => investmentAllocation(item, investments))
  investments.forEach((item, index) => { if (item.monthlyContribution === undefined) item.allocation = allocations[index]! })
}

function edit(entry?: CashFlow | Investment | Liability) {
  editing.value = entry
  editorOpen.value = true
}
function storeEntry(entry: CashFlow | Investment | Liability) {
  if (activeCategory.value === 'investments') preserveAllocations()
  const items = draft.value[activeCategory.value] as (CashFlow | Investment | Liability)[]
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
  const items = draft.value[activeCategory.value]
  const index = items.findIndex(item => item.id === deleting.value?.id)
  if (index >= 0) items.splice(index, 1)
}
function changeYears(value: string | number | undefined) {
  draft.value.years = Number(value)
  if (Number.isInteger(draft.value.years) && draft.value.years >= 1 && draft.value.years <= 40) selectedMonth.value = draft.value.years * 12
}
function changePortfolioPreset(value: string) {
  portfolioPreset.value = value
  const preset = portfolioPresets[value as keyof typeof portfolioPresets]
  if (preset) {
    portfolioMean.value = preset.mean
    portfolioVolatility.value = preset.volatility
  }
}
function changePortfolioAssumption(kind: 'mean' | 'volatility', value: number) {
  if (kind === 'mean') portfolioMean.value = value
  else portfolioVolatility.value = value
  portfolioPreset.value = 'custom'
}
async function chooseProfile(value: string) {
  try {
    await selectProfile(value === 'personal-forecast' ? undefined : value)
    selectedMonth.value = draft.value.years * 12
  } catch {
    profileError.value = 'This profile could not be loaded. Try again.'
  }
}
function openProfileDialog(mode: 'copy' | 'new' = 'copy') {
  profileDialogMode.value = mode
  profileName.value = ''
  profileDescription.value = ''
  profileError.value = ''
  profileDialogOpen.value = true
}

async function addProfile() {
  profileError.value = ''
  const name = profileName.value.trim()
  if (!name) {
    profileError.value = 'Give this scenario a name.'
    return
  }
  creatingProfile.value = true
  try {
    await createProfile(name, profileDescription.value.trim(), profileDialogMode.value === 'new' ? emptyPlan() : undefined)
    selectedMonth.value = draft.value.years * 12
    profileDialogOpen.value = false
  } catch {
    profileError.value = 'This scenario could not be saved. Try again.'
  } finally {
    creatingProfile.value = false
  }
}
function clearExample() {
  draft.value = emptyPlan()
  selectedMonth.value = draft.value.years * 12
  exampleCleared.value = true
}
if (!guest) {
  const requestedProfile = route.query.profile
  if (typeof requestedProfile === 'string' && requestedProfile && requestedProfile !== activeProfile.value?.id) {
    await chooseProfile(requestedProfile)
    await navigateTo('/', { replace: true })
  }
}
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <div class="app-shell">
      <header class="site-header">
        <a class="brand" href="/" aria-label="Worthwhile home"><span class="brand-icon"><ChartNoAxesCombined :size="20" :stroke-width="2" /></span><span>worthwhile.</span></a>
        <div class="header-context"><span>{{ guest ? 'Personal forecast' : activeProfile?.name ?? 'Personal forecast' }}</span><span class="header-separator">/</span> USD</div>
        <div class="local-label"><IconButton v-if="guest" as-child label="Sign in"><NuxtLink to="/sign-in"><UserRound :size="18" /></NuxtLink></IconButton><NuxtLink v-else :to="settingsLink" class="profile-avatar" aria-label="Open profile settings"><img v-if="user?.imageUrl" :src="user.imageUrl" :alt="user.fullName || 'Profile'" referrerpolicy="no-referrer"><span v-else>{{ firstName.slice(0, 1).toUpperCase() }}</span></NuxtLink></div>
      </header>

      <main>
        <div class="page-heading" :class="{ 'profile-heading': !guest }">
          <div class="identity-heading">
            <h1 v-if="showExample">Your example plan</h1><h1 v-else>Hi {{ firstName }}. <span class="greeting-message">{{ greeting }}</span></h1>
          </div>
          <div v-if="showExample && !exampleCleared" class="example-controls"><span class="save-state" role="status">Example data only. Sign in to build and save your own plan.</span><IconButton label="Reset example data" @click="clearExample"><RefreshCw :size="16" /></IconButton></div><span v-else-if="guest" class="save-state" role="status">Temporary plan. Changes are not saved.</span>
          <div v-else class="profile-toolbar">
            <Select :model-value="activeProfile?.id ?? 'personal-forecast'" :disabled="saving || creatingProfile" @update:model-value="chooseProfile(String($event))">
              <SelectTrigger aria-label="Change financial profile" class="profile-select"><SelectValue :placeholder="activeProfile?.name ?? 'Personal forecast'">{{ activeProfile?.description ? `${activeProfile.name} — ${activeProfile.description}` : activeProfile?.name ?? 'Personal forecast' }}</SelectValue></SelectTrigger>
              <SelectContent><SelectGroup><SelectLabel>Financial profiles</SelectLabel><SelectItem value="personal-forecast">Personal forecast</SelectItem><SelectItem v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.description ? `${profile.name} — ${profile.description}` : profile.name }}</SelectItem></SelectGroup></SelectContent>
            </Select>
            <DropdownMenuRoot :modal="false">
              <DropdownMenuTrigger as-child><IconButton label="Profile actions" class="profile-menu-trigger"><EllipsisVertical :size="18" /></IconButton></DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent class="profile-menu relative z-50" align="end" :side-offset="6" :collision-padding="12" @close-auto-focus="event => { if (profileDialogOpen || reloadOpen || clearOpen) event.preventDefault() }">
                  <DropdownMenuGroup>
                    <Tooltip><TooltipTrigger as-child><DropdownMenuItem aria-label="Reset to saved plan" text-value="Reset to saved plan" :disabled="saving || creatingProfile || !!loadError" @select="reloadOpen = true"><RefreshCw :size="16" /></DropdownMenuItem></TooltipTrigger><TooltipContent side="left">Reset to saved plan</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger as-child><DropdownMenuItem aria-label="Save as a new profile" text-value="Save as a new profile" :disabled="saving || creatingProfile || !!loadError || !forecast.result" @select="openProfileDialog('copy')"><BookmarkPlus :size="16" /></DropdownMenuItem></TooltipTrigger><TooltipContent side="left">Save as a new profile</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger as-child><DropdownMenuItem aria-label="Clear all" text-value="Clear all" :disabled="saving || creatingProfile || !!loadError" @select="clearOpen = true"><Trash2 :size="16" /></DropdownMenuItem></TooltipTrigger><TooltipContent side="left">Clear all</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger as-child><DropdownMenuItem aria-label="New profile" text-value="New profile" :disabled="saving || creatingProfile || !!loadError || !forecast.result" @select="openProfileDialog('new')"><Plus :size="16" /></DropdownMenuItem></TooltipTrigger><TooltipContent side="left">New profile</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger as-child><DropdownMenuItem aria-label="Manage profiles" text-value="Manage profiles" @select="() => navigateTo('/profiles')"><Layers :size="16" /></DropdownMenuItem></TooltipTrigger><TooltipContent side="left">Manage profiles</TooltipContent></Tooltip>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenuRoot>
            <span v-if="!loadError && (saving || dirty || saveError || !forecast.result)" class="save-state" role="status" aria-live="polite" data-testid="save-status"><LoaderCircle v-if="saving || (dirty && forecast.result && !saveError)" class="spin" :size="14" /><CircleAlert v-else :size="14" />{{ saveError || !forecast.result ? 'Not saved' : 'Saving...' }}</span>
          </div>
        </div>

        <div v-if="loadError" class="feedback error" role="alert"><CircleAlert :size="18" /><div><template v-if="loadError.statusCode === 401"><strong>Your session has expired.</strong><NuxtLink to="/sign-in">Sign in again</NuxtLink></template><template v-else><strong>Could not load your saved plan.</strong><p>Your database has not been changed.</p></template></div><IconButton label="Retry loading plan" :disabled="status === 'pending'" @click="reload"><RefreshCw :size="15" /></IconButton></div>
        <template v-else>
          <div v-if="saveError" class="feedback error" role="alert"><CircleAlert :size="18" /><p>{{ saveError }}</p><IconButton v-if="conflict" label="Reload saved plan" @click="reloadOpen = true"><RefreshCw :size="15" /></IconButton><IconButton v-else label="Retry saving plan" :disabled="saving || !forecast.result" @click="save"><RefreshCw :size="15" /></IconButton></div>
          <div v-if="forecast.error" class="feedback error" role="alert"><CircleAlert :size="18" /><p>{{ forecast.error }}</p></div>

          <section class="overview" aria-label="Net worth summary">
            <Card class="metric current"><CardHeader><div class="metric-label"><span class="metric-title">Net worth today</span></div><strong data-testid="current-worth">{{ first ? money(first.netWorth) : '--' }}</strong></CardHeader><CardContent><div class="metric-desktop-detail"><p class="metric-note">Assets minus liabilities</p><p class="percentile-stat" data-testid="current-percentile">{{ currentPercentile }}</p></div><p class="metric-mobile-detail" aria-label="Current net worth percentile">{{ compactPercentile(currentPercentile) }}</p></CardContent></Card>
            <Card class="metric projected"><CardHeader><div class="metric-label"><span class="metric-title">Projected net worth</span><span class="small-badge">{{ selected ? selectedPeriod : '--' }}</span></div><strong data-testid="projected-worth">{{ selected ? money(selected.netWorth) : '--' }}</strong></CardHeader><CardContent><div class="metric-desktop-detail"><p class="metric-note"><TrendingUp :size="14" />{{ money(growth) }} projected change</p><p class="percentile-stat" data-testid="projected-percentile">{{ selectedPercentile }}</p></div><p class="metric-mobile-detail"><TrendingUp :size="13" /><span>{{ compactMoney(growth) }}</span><span aria-label="Projected net worth percentile">{{ compactPercentile(selectedPercentile) }}</span></p></CardContent></Card>
            <Card class="metric monthly-surplus"><CardHeader><div class="metric-label"><span class="metric-title">Monthly surplus</span><ArrowUpRight :size="16" /></div><strong :class="{ negative: monthlySurplus < 0 }">{{ money(monthlySurplus) }}</strong></CardHeader><CardContent><p class="metric-note">After expenses &amp; debt payments</p><p class="percentile-stat">Available to save or invest</p></CardContent></Card>
          </section>
          <Card class="forecast-section" role="region" aria-labelledby="forecast-title">
            <CardHeader class="section-heading forecast-heading">
              <div class="section-title"><h2 id="forecast-title">The view ahead</h2><CardDescription>{{ monthLabel(0, start) }} <ChevronRight :size="13" />{{ monthLabel(draft.years * 12 || 0, start) }}</CardDescription></div>
              <Tabs v-model="forecastMode" class="forecast-mode icon-toggle">
                <TabsList aria-label="Forecast method">
                  <TabsTrigger value="deterministic" aria-label="Deterministic forecast" title="Deterministic forecast"><ChartNoAxesCombined :size="16" /></TabsTrigger>
                  <TabsTrigger value="monte-carlo" aria-label="Monte Carlo forecast" title="Monte Carlo forecast"><Dices :size="16" /></TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
            <div class="forecast-controls" :class="{ 'has-assumptions': forecastMode === 'monte-carlo' }">
              <template v-if="forecastMode === 'monte-carlo'">
                <div class="assumption-preset">
                  <Label for="portfolio-preset">Risk profile</Label>
                  <Select :model-value="portfolioPreset" @update:model-value="changePortfolioPreset(String($event))"><SelectTrigger id="portfolio-preset"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectLabel>Return assumptions</SelectLabel><SelectItem value="conservative">Conservative</SelectItem><SelectItem value="aggressive">Aggressive</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectGroup></SelectContent></Select>
                </div>
                <div class="assumption-slider mean-setting">
                  <Label>Mean return <strong>{{ portfolioMean }}%</strong></Label>
                  <Slider :model-value="[portfolioMean]" :min="-5" :max="15" :step="0.5" aria-label="Mean annual return" @update:model-value="value => changePortfolioAssumption('mean', value?.[0] ?? portfolioMean)" />
                </div>
                <div class="assumption-slider volatility-setting">
                  <Label>Volatility <strong>{{ portfolioVolatility }}%</strong></Label>
                  <Slider :model-value="[portfolioVolatility]" :min="0" :max="40" :step="0.5" aria-label="Annual volatility" @update:model-value="value => changePortfolioAssumption('volatility', value?.[0] ?? portfolioVolatility)" />
                </div>
              </template>
              <div class="horizon"><NumberField id="years" :model-value="draft.years" :min="1" :max="40" :step="1" :format-options="{ style: 'unit', unit: 'year', unitDisplay: 'long' }" @update:model-value="changeYears"><NumberFieldContent><NumberFieldDecrement aria-label="Decrease time horizon" /><NumberFieldInput aria-label="Time horizon in years" /><NumberFieldIncrement aria-label="Increase time horizon" /></NumberFieldContent></NumberField></div>
            </div>
            <div class="chart-summary">
              <p v-if="forecastMode === 'monte-carlo'" class="simulation-outcome"><strong>{{ simulationProbability }}% chance</strong> of {{ simulationTarget }} by {{ monthLabel(draft.years * 12, start) }}</p>
              <div v-if="forecastMode === 'deterministic'" class="legend" aria-label="Chart legend"><span><i class="legend-dot net-worth" />Net worth</span><span><i class="legend-dot assets" />Assets</span><span><i class="legend-dot debt" />Liabilities</span></div>
              <div v-else class="legend" aria-label="Monte Carlo chart legend"><span><i class="legend-dot net-worth" />Median</span><span><i class="legend-band inner" />P25–P75</span><span><i class="legend-band outer" />P10–P90</span><span><i class="legend-line" />Deterministic</span></div>
            </div>
            <div v-if="forecast.result" class="chart-shell"><ClientOnly><NetWorthChart :points="forecast.result.points" :start="start" :simulation="simulation?.points" /><template #fallback><div class="chart-placeholder"><LoaderCircle class="spin" :size="20" /><span>Loading forecast</span></div></template></ClientOnly></div>
            <div v-else class="chart-placeholder">Forecast unavailable until the values are valid.</div>
            <div v-if="selected" class="month-breakdown">
              <div><span>Cash</span><strong>{{ money(selected.cash) }}</strong></div><div><span>Investments</span><strong>{{ money(selected.invested) }}</strong></div><div><span>Liabilities</span><strong>{{ money(selected.debt) }}</strong></div><div class="breakdown-worth"><span>Net worth</span><strong>{{ money(selected.netWorth) }}</strong></div>
            </div>
            </CardContent>
          </Card>

          <div v-if="forecast.result?.firstShortfall" class="feedback warning" role="status"><CircleAlert :size="18" /><p><strong>Cash shortfall from {{ monthLabel(forecast.result.firstShortfall, start) }}.</strong> Negative cash is unfunded; investments are not sold automatically.</p></div>
          <div v-if="forecast.result?.growingDebts.length" class="feedback warning" role="status"><CircleAlert :size="18" /><p><strong>Payments do not cover interest:</strong> {{ draft.liabilities.filter(item => forecast.result?.growingDebts.includes(item.id)).map(item => item.name).join(', ') }}.</p></div>

          <Card class="financial-section" role="region" aria-labelledby="financial-title">
            <CardHeader class="section-heading"><div class="section-title"><h2 id="financial-title">Your financial picture</h2><CardDescription>The starting point for your forecast</CardDescription></div><div class="financial-actions"><div class="cash-setting"><Wallet :size="16" /><Label for="starting-cash">Starting cash</Label><span class="cash-input"><span>$</span><Input id="starting-cash" :model-value="draft.startingCash / 100" type="number" min="0" step="0.01" max="1000000000000" @update:model-value="value => draft.startingCash = Math.round(Number(value) * 100)" /></span></div></div></CardHeader>
            <CardContent>
            <Tabs v-model="activeCategory" class="financial-tabs">
              <TabsList class="category-rail" aria-label="Financial categories"><TabsTrigger v-for="category in categories" :key="category.key" :value="category.key" class="category-rail-item"><span class="category-rail-label"><component :is="category.icon" :size="16" /><span>{{ category.label }}</span><span class="entry-count">{{ draft[category.key].length }}</span></span><span class="category-rail-total">{{ money(categoryTotals[category.key]) }}</span></TabsTrigger></TabsList>
              <div class="ledger-toolbar"><div><h3>{{ currentCategory.label }}</h3><span class="muted">{{ activeCategory === 'incomes' || activeCategory === 'expenses' ? 'Monthly total' : 'Current balance' }}: {{ money(categoryTotals[activeCategory]) }}</span><span v-if="activeCategory === 'incomes'" class="muted" data-testid="yearly-income">{{ money(yearlyIncome, true) }} / year</span><span v-if="activeCategory === 'investments'" class="muted">{{ fixedMonthly ? `${money(fixedMonthly, true)} / month fixed; ` : '' }}{{ cashAllocation.toFixed(2) }}% of {{ fixedMonthly ? 'remainder' : 'surplus' }} stays in cash</span></div><IconButton variant="default" :label="`Add ${currentCategory.singular}`" @click="edit()"><Plus :size="18" /></IconButton></div>
              <Table v-if="entries.length" class="ledger-table" role="table">
                <TableCaption class="sr-only">{{ currentCategory.label }} entries</TableCaption>
                <TableHeader role="rowgroup"><TableRow role="row"><TableHead role="columnheader">Name</TableHead><TableHead role="columnheader" class="text-right">{{ activeCategory === 'incomes' || activeCategory === 'expenses' ? 'Amount' : 'Current balance' }}</TableHead><TableHead role="columnheader">{{ activeCategory === 'investments' ? 'Annual ROI' : activeCategory === 'liabilities' ? 'Interest APR' : 'Frequency' }}</TableHead><TableHead role="columnheader" class="text-right">{{ activeCategory === 'investments' ? 'Surplus allocation' : activeCategory === 'liabilities' ? 'Monthly payment' : 'Monthly total' }}</TableHead><TableHead v-if="activeCategory === 'incomes'" role="columnheader" class="text-right">Yearly total</TableHead><TableHead role="columnheader"><span class="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                <TableBody role="rowgroup">
                  <TableRow v-for="entry in entries" :key="entry.id" role="row">
                    <TableCell role="cell"><div class="entry-name"><span class="entry-icon" :class="activeCategory"><component :is="currentCategory.icon" :size="16" /></span><span>{{ entry.name }}</span></div></TableCell>
                    <TableCell role="cell" :data-label="'amount' in entry ? 'Amount' : 'Current balance'" class="text-right tabular-nums">{{ money('amount' in entry ? entry.amount : entry.balance, true) }}</TableCell>
                    <TableCell role="cell" :data-label="'frequency' in entry ? 'Frequency' : 'annualRoi' in entry ? 'Annual ROI' : 'Interest APR'"><span v-if="'frequency' in entry" class="frequency-tag">{{ entry.frequency === 'annual' ? 'Annual' : 'Monthly' }}</span><span v-else-if="'annualRoi' in entry" class="rate">{{ entry.annualRoi }}%</span><span v-else>{{ entry.apr }}%</span></TableCell>
                    <TableCell role="cell" :data-label="'amount' in entry ? 'Monthly total' : 'annualRoi' in entry ? 'Surplus allocation' : 'Monthly payment'" class="text-right tabular-nums">{{ 'amount' in entry ? money(monthlyAmount(entry), true) : 'annualRoi' in entry ? allocationLabel(entry) : money(entry.payment, true) }}</TableCell>
                    <TableCell v-if="activeCategory === 'incomes' && 'amount' in entry" role="cell" data-label="Yearly total" class="text-right tabular-nums">{{ money(annualAmount(entry), true) }}</TableCell>
                    <TableCell role="cell"><div class="row-actions"><Tooltip><TooltipTrigger as-child><Button variant="ghost" size="icon" :aria-label="`Edit ${entry.name}`" @click="edit(entry)"><Pencil :size="15" /></Button></TooltipTrigger><TooltipContent>Edit {{ entry.name }}</TooltipContent></Tooltip><Tooltip><TooltipTrigger as-child><Button variant="ghost" size="icon" :aria-label="`Delete ${entry.name}`" @click="confirmDelete(entry)"><Trash2 :size="15" /></Button></TooltipTrigger><TooltipContent>Delete {{ entry.name }}</TooltipContent></Tooltip></div></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div v-else class="empty-ledger"><span class="empty-icon"><component :is="currentCategory.icon" :size="23" /></span><h3>No {{ activeCategory === 'incomes' ? 'income sources' : currentCategory.label.toLowerCase() }} yet</h3><Button variant="link" @click="edit()"><Plus :size="15" />Add your first {{ currentCategory.singular }}</Button></div>
            </Tabs>
            </CardContent>
          </Card>
          <footer class="page-footer"><p>Monthly compounding. Custom surplus allocations. Fixed returns; no taxes or inflation. Estimates, not guarantees.</p><nav aria-label="Legal and support"><a href="/privacy">Privacy policy</a><a href="/terms">Terms of use</a><a href="mailto:support@worthwhile.app">Contact</a></nav></footer>
        </template>
      </main>
      <FinancialEntryDialog v-model:open="editorOpen" :category="activeCategory" :entry="editing" :investments="draft.investments" @save="storeEntry" />
      <Dialog v-model:open="profileDialogOpen">
        <DialogContent class="entry-dialog">
          <DialogHeader class="entry-dialog-header"><DialogTitle>{{ profileDialogMode === 'new' ? 'New profile' : 'Save this forecast as a profile' }}</DialogTitle><DialogDescription>{{ profileDialogMode === 'new' ? 'Start with an empty plan. Your current profile stays saved.' : 'Create a separate version of the numbers you are viewing now.' }}</DialogDescription></DialogHeader>
          <form class="entry-form" @submit.prevent="addProfile">
            <div class="field entry-name-field"><Label for="profile-name">Profile name</Label><Input id="profile-name" v-model="profileName" :aria-invalid="!!profileError" maxlength="60" required autofocus placeholder="e.g. Early retirement at 55" /><span class="field-hint">Required · {{ profileName.length }}/60</span></div>
            <div class="field"><Label for="profile-description">Description</Label><Input id="profile-description" v-model="profileDescription" maxlength="180" placeholder="Optional" /><span class="field-hint">Optional · {{ profileDescription.length }}/180</span></div>
            <p v-if="profileError" class="form-error" role="alert">{{ profileError }}</p>
            <DialogFooter><Button type="button" variant="outline" :disabled="creatingProfile" @click="profileDialogOpen = false">Cancel</Button><Button type="submit" :disabled="creatingProfile"><LoaderCircle v-if="creatingProfile" class="spin" data-icon="inline-start" /><Plus v-else-if="profileDialogMode === 'new'" data-icon="inline-start" /><BookmarkPlus v-else data-icon="inline-start" />{{ profileDialogMode === 'new' ? 'Create profile' : 'Save profile' }}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog v-model:open="deleteOpen"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {{ deleting?.name }}?</AlertDialogTitle><AlertDialogDescription>This removes the entry from your forecast.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction @click="removeEntry"><Trash2 :size="15" />Delete entry</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog v-model:open="reloadOpen"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reload the saved plan?</AlertDialogTitle><AlertDialogDescription>Unsaved changes in this tab will be replaced with the latest saved version.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction @click="reload"><RefreshCw :size="15" />Reload plan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog v-model:open="clearOpen"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Clear your entire plan?</AlertDialogTitle><AlertDialogDescription>This permanently removes all financial entries and resets your starting cash. Your profile details stay saved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep plan</AlertDialogCancel><AlertDialogAction @click="clear"><Trash2 :size="15" />Clear all</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  </TooltipProvider>
</template>
