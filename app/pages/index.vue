<script setup lang="ts">
import { ArrowDownLeft, ArrowUpRight, ChartNoAxesCombined, Check, ChevronRight, CircleAlert, Database, Landmark, LoaderCircle, Pencil, Plus, RefreshCw, Save, Trash2, TrendingUp, Wallet } from 'lucide-vue-next'
import { investmentAllocation, type CashFlow, type Category, type Investment, type Liability } from '#shared/schemas/financial-plan'
import { annualAmount, monthlyAmount } from '#shared/utils/projection'
import { netWorthPercentile, percentileLabel, WEALTH_BENCHMARK } from '#shared/utils/wealth-percentile'
import { money, monthLabel } from '@/lib/format'

definePageMeta({ alias: '/guest' })
const { isSignedIn } = useAuth()
const guest = useRoute().path === '/guest' || !isSignedIn.value
const { draft, dirty, saving, saveError, conflict, loadError, status, forecast, save, reload } = await useFinancialPlan(guest)
const start = useState('forecast-start', () => new Date().toISOString().slice(0, 7))
const activeCategory = ref<Category>('incomes')
const editorOpen = ref(false)
const editing = ref<CashFlow | Investment | Liability>()
const deleting = ref<CashFlow | Investment | Liability>()
const deleteOpen = ref(false)
const reloadOpen = ref(false)
const selectedMonth = ref(draft.value.years * 12)
const chartView = ref('chart')
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
const yearlyIncome = computed(() => draft.value.incomes.reduce((total, income) => total + annualAmount(income), 0))
const selectedPeriod = computed(() => {
  const month = selected.value?.month ?? 0
  if (!month) return 'Today'
  const years = Math.floor(month / 12)
  const months = month % 12
  return [years ? `${years} ${years === 1 ? 'year' : 'years'}` : '', months ? `${months} ${months === 1 ? 'month' : 'months'}` : ''].filter(Boolean).join(' ')
})
const yearly = computed(() => forecast.value.result?.points.filter(point => point.month % 12 === 0) ?? [])
const monthlyPayments = computed(() => forecast.value.result?.points[1]?.payments ?? 0)
const monthlySurplus = computed(() => (forecast.value.result?.income ?? 0) - (forecast.value.result?.expenses ?? 0) - monthlyPayments.value)
const totalInvested = computed(() => draft.value.investments.reduce((total, item) => total + item.balance, 0))
const totalDebt = computed(() => draft.value.liabilities.reduce((total, item) => total + item.balance, 0))
const categoryTotals = computed(() => ({ incomes: forecast.value.result?.income ?? 0, investments: totalInvested.value, expenses: forecast.value.result?.expenses ?? 0, liabilities: totalDebt.value }))
const growth = computed(() => (selected.value?.netWorth ?? 0) - (first.value?.netWorth ?? 0))
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
function changeYears(value: string | number) {
  draft.value.years = Number(value)
  if (Number.isInteger(draft.value.years) && draft.value.years >= 1 && draft.value.years <= 40) selectedMonth.value = draft.value.years * 12
}
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <div class="app-shell">
      <header class="site-header">
        <a class="brand" :href="guest ? '/guest' : '/'" aria-label="Worthwhile home"><span class="brand-icon"><ChartNoAxesCombined :size="23" :stroke-width="2" /></span><span>worthwhile<span class="brand-period">.</span></span></a>
        <div class="header-context"><span class="local-dot" />Personal forecast <span class="header-separator">/</span> USD</div>
        <div class="local-label"><Database :size="14" />{{ guest ? 'Guest workspace' : 'Private workspace' }}<Button v-if="guest" as-child variant="outline"><NuxtLink to="/sign-in">Sign in</NuxtLink></Button><UserButton v-else /></div>
      </header>

      <main>
        <div class="page-heading">
          <div><p class="eyebrow">YOUR FINANCIAL OUTLOOK</p><h1>Net worth estimator</h1></div>
          <span v-if="guest" class="save-state" role="status">Temporary plan. Changes are not saved.</span>
          <div v-else class="save-controls">
            <span class="save-state" role="status"><LoaderCircle v-if="saving" class="spin" :size="14" /><span v-else-if="dirty" class="unsaved-dot" /><Check v-else :size="14" />{{ saving ? 'Saving' : dirty ? 'Unsaved changes' : 'Saved locally' }}</span>
            <Button :disabled="!dirty || saving || !forecast.result || !!loadError || conflict" @click="save"><Save :size="16" />Save changes</Button>
          </div>
        </div>

        <div v-if="loadError" class="feedback error" role="alert"><CircleAlert :size="18" /><div><template v-if="loadError.statusCode === 401"><strong>Your session has expired.</strong><NuxtLink to="/sign-in">Sign in again</NuxtLink></template><template v-else><strong>Could not load your saved plan.</strong><p>Your database has not been changed.</p></template></div><Button variant="outline" :disabled="status === 'pending'" @click="reload"><RefreshCw :size="15" />Retry</Button></div>
        <template v-else>
          <div v-if="saveError" class="feedback error" role="alert"><CircleAlert :size="18" /><p>{{ saveError }}</p><Button v-if="conflict" variant="outline" @click="reloadOpen = true"><RefreshCw :size="15" />Reload saved plan</Button></div>
          <div v-if="forecast.error" class="feedback error" role="alert"><CircleAlert :size="18" /><p>{{ forecast.error }}</p></div>

          <section class="overview" aria-label="Net worth summary">
            <div class="metric"><span class="metric-label">Net worth today</span><strong data-testid="current-worth">{{ first ? money(first.netWorth) : '--' }}</strong><span class="metric-note">Assets minus liabilities</span><span class="percentile-stat" data-testid="current-percentile">{{ currentPercentile }}</span></div>
            <div class="metric projected"><span class="metric-label">Projected net worth <span class="small-badge">{{ selected ? selectedPeriod : '--' }}</span></span><strong data-testid="projected-worth">{{ selected ? money(selected.netWorth) : '--' }}</strong><span class="metric-note"><TrendingUp :size="14" />{{ money(growth) }} projected change</span><span class="percentile-stat" data-testid="projected-percentile">{{ selectedPercentile }}</span></div>
            <div class="metric"><span class="metric-label">Monthly surplus</span><strong :class="{ negative: monthlySurplus < 0 }">{{ money(monthlySurplus) }}</strong><span class="metric-note">After expenses &amp; debt payments</span></div>
          </section>
          <p class="benchmark-note">Percentiles: U.S. households, all ages, <a :href="WEALTH_BENCHMARK.source" target="_blank" rel="noopener noreferrer">{{ WEALTH_BENCHMARK.year }} Federal Reserve SCF</a>. Not inflation-adjusted; projections use the same historical benchmark, not future wealth rankings.</p>

          <section class="forecast-section" aria-labelledby="forecast-title">
            <div class="section-heading"><div class="section-title"><h2 id="forecast-title">The view ahead</h2><span class="muted">{{ monthLabel(0, start) }} <ChevronRight :size="13" />{{ monthLabel(draft.years * 12 || 0, start) }}</span></div><Tabs v-model="chartView"><TabsList aria-label="Forecast view"><TabsTrigger value="chart">Chart</TabsTrigger><TabsTrigger value="table">Annual table</TabsTrigger></TabsList></Tabs></div>
            <div class="forecast-controls">
              <div class="legend" aria-label="Chart legend"><span><i class="legend-dot net-worth" />Net worth</span><span><i class="legend-dot assets" />Assets</span><span><i class="legend-dot debt" />Liabilities</span></div>
              <div class="horizon"><Label for="years">Horizon</Label><Slider :model-value="[draft.years]" :min="1" :max="40" :step="1" aria-label="Forecast horizon" class="horizon-slider" @update:model-value="value => changeYears(value?.[0] ?? 10)" /><Input id="years" :model-value="draft.years" type="number" min="1" max="40" step="1" @update:model-value="changeYears" /><span>years</span></div>
            </div>
            <div v-if="forecast.result && chartView === 'chart'" class="chart-shell"><ClientOnly><NetWorthChart :points="forecast.result.points" :start="start" /><template #fallback><div class="chart-placeholder"><LoaderCircle class="spin" :size="20" /><span>Loading forecast</span></div></template></ClientOnly></div>
            <div v-else-if="chartView === 'table' && forecast.result" class="annual-table"><Table><TableCaption class="sr-only">Annual net worth projection in US dollars</TableCaption><TableHeader><TableRow><TableHead>Date</TableHead><TableHead class="text-right">Cash</TableHead><TableHead class="text-right">Investments</TableHead><TableHead class="text-right">Liabilities</TableHead><TableHead class="text-right">Net worth</TableHead></TableRow></TableHeader><TableBody><TableRow v-for="point in yearly" :key="point.month"><TableCell>{{ monthLabel(point.month, start) }}</TableCell><TableCell class="text-right">{{ money(point.cash) }}</TableCell><TableCell class="text-right">{{ money(point.invested) }}</TableCell><TableCell class="text-right">{{ money(point.debt) }}</TableCell><TableCell class="text-right font-semibold">{{ money(point.netWorth) }}</TableCell></TableRow></TableBody></Table></div>
            <div v-else class="chart-placeholder">Forecast unavailable until the values are valid.</div>
            <div v-if="selected" class="month-breakdown">
              <div class="month-selector"><Label for="selected-month">{{ monthLabel(selected.month, start) }}</Label><input id="selected-month" v-model.number="selectedMonth" type="range" min="0" :max="draft.years * 12" step="1" aria-label="Selected forecast month" /></div>
              <div><span>Cash</span><strong>{{ money(selected.cash) }}</strong></div><div><span>Investments</span><strong>{{ money(selected.invested) }}</strong></div><div><span>Liabilities</span><strong>{{ money(selected.debt) }}</strong></div><div class="breakdown-worth"><span>Net worth</span><strong>{{ money(selected.netWorth) }}</strong></div>
            </div>
          </section>

          <div v-if="forecast.result?.firstShortfall" class="feedback warning" role="status"><CircleAlert :size="18" /><p><strong>Cash shortfall from {{ monthLabel(forecast.result.firstShortfall, start) }}.</strong> Negative cash is unfunded; investments are not sold automatically.</p></div>
          <div v-if="forecast.result?.growingDebts.length" class="feedback warning" role="status"><CircleAlert :size="18" /><p><strong>Payments do not cover interest:</strong> {{ draft.liabilities.filter(item => forecast.result?.growingDebts.includes(item.id)).map(item => item.name).join(', ') }}.</p></div>

          <section class="financial-section" aria-labelledby="financial-title">
            <div class="section-heading"><div class="section-title"><h2 id="financial-title">Your financial picture</h2><span class="muted">The starting point for your forecast</span></div><div class="cash-setting"><Wallet :size="16" /><Label for="starting-cash">Starting cash</Label><span class="cash-input"><span>$</span><Input id="starting-cash" :model-value="draft.startingCash / 100" type="number" min="0" step="0.01" max="1000000000000" @update:model-value="value => draft.startingCash = Math.round(Number(value) * 100)" /></span></div></div>
            <Tabs v-model="activeCategory" class="financial-tabs">
              <TabsList class="category-tabs" aria-label="Financial categories"><TabsTrigger v-for="category in categories" :key="category.key" :value="category.key"><component :is="category.icon" :size="16" /><span>{{ category.label }}</span><span class="entry-count">{{ draft[category.key].length }}</span></TabsTrigger></TabsList>
              <div class="ledger-toolbar"><div><h3>{{ currentCategory.label }}</h3><span class="muted">{{ money(categoryTotals[activeCategory]) }}{{ activeCategory === 'incomes' || activeCategory === 'expenses' ? ' / month' : ' current balance' }}</span><span v-if="activeCategory === 'incomes'" class="muted" data-testid="yearly-income">{{ money(yearlyIncome, true) }} / year</span><span v-if="activeCategory === 'investments'" class="muted">{{ fixedMonthly ? `${money(fixedMonthly, true)} / month fixed; ` : '' }}{{ cashAllocation.toFixed(2) }}% of {{ fixedMonthly ? 'remainder' : 'surplus' }} stays in cash</span></div><Button variant="outline" @click="edit()"><Plus :size="16" />Add {{ currentCategory.singular }}</Button></div>
              <Table v-if="entries.length" class="ledger-table"><TableCaption class="sr-only">{{ currentCategory.label }} entries</TableCaption><TableHeader><TableRow><TableHead>Name</TableHead><TableHead class="text-right">{{ activeCategory === 'incomes' || activeCategory === 'expenses' ? 'Amount' : 'Current balance' }}</TableHead><TableHead>{{ activeCategory === 'investments' ? 'Annual ROI' : activeCategory === 'liabilities' ? 'Interest APR' : 'Frequency' }}</TableHead><TableHead class="text-right">{{ activeCategory === 'investments' ? 'Surplus allocation' : activeCategory === 'liabilities' ? 'Monthly payment' : 'Monthly total' }}</TableHead><TableHead v-if="activeCategory === 'incomes'" class="text-right">Yearly total</TableHead><TableHead><span class="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody><TableRow v-for="entry in entries" :key="entry.id"><TableCell><div class="entry-name"><span class="entry-icon" :class="activeCategory"><component :is="currentCategory.icon" :size="16" /></span><span>{{ entry.name }}</span></div></TableCell><TableCell class="text-right tabular-nums">{{ money('amount' in entry ? entry.amount : entry.balance, true) }}</TableCell><TableCell><span v-if="'frequency' in entry" class="frequency-tag">{{ entry.frequency === 'annual' ? 'Annual' : 'Monthly' }}</span><span v-else-if="'annualRoi' in entry" class="rate">{{ entry.annualRoi }}%</span><span v-else>{{ entry.apr }}%</span></TableCell><TableCell class="text-right tabular-nums">{{ 'amount' in entry ? money(monthlyAmount(entry), true) : 'annualRoi' in entry ? allocationLabel(entry) : money(entry.payment, true) }}</TableCell><TableCell v-if="activeCategory === 'incomes' && 'amount' in entry" class="text-right tabular-nums">{{ money(annualAmount(entry), true) }}</TableCell><TableCell><div class="row-actions"><Tooltip><TooltipTrigger as-child><Button variant="ghost" size="icon" :aria-label="`Edit ${entry.name}`" @click="edit(entry)"><Pencil :size="15" /></Button></TooltipTrigger><TooltipContent>Edit {{ entry.name }}</TooltipContent></Tooltip><Tooltip><TooltipTrigger as-child><Button variant="ghost" size="icon" :aria-label="`Delete ${entry.name}`" @click="confirmDelete(entry)"><Trash2 :size="15" /></Button></TooltipTrigger><TooltipContent>Delete {{ entry.name }}</TooltipContent></Tooltip></div></TableCell></TableRow></TableBody></Table>
              <div v-else class="empty-ledger"><span class="empty-icon"><component :is="currentCategory.icon" :size="23" /></span><h3>No {{ activeCategory === 'incomes' ? 'income sources' : currentCategory.label.toLowerCase() }} yet</h3><Button variant="link" @click="edit()"><Plus :size="15" />Add your first {{ currentCategory.singular }}</Button></div>
            </Tabs>
          </section>
          <footer class="page-footer"><span><span class="local-dot" />{{ guest ? 'Guest plan clears when you leave or reload' : 'Stored in SQLite on this computer' }}</span><p>Monthly compounding. Custom surplus allocations. Fixed returns; no taxes or inflation. Estimates, not guarantees.</p></footer>
        </template>
      </main>
      <FinancialEntryDialog v-model:open="editorOpen" :category="activeCategory" :entry="editing" :investments="draft.investments" @save="storeEntry" />
      <AlertDialog v-model:open="deleteOpen"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {{ deleting?.name }}?</AlertDialogTitle><AlertDialogDescription>This removes the entry from your forecast. Save changes to update the stored plan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction @click="removeEntry"><Trash2 :size="15" />Delete entry</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog v-model:open="reloadOpen"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reload the saved plan?</AlertDialogTitle><AlertDialogDescription>Unsaved changes in this tab will be replaced with the latest saved version.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction @click="reload"><RefreshCw :size="15" />Reload plan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  </TooltipProvider>
</template>