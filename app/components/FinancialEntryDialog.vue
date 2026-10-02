<script setup lang="ts">
import { cashFlowSchema, investmentAllocation, investmentSchema, liabilitySchema, realEstateSchema, type CashFlow, type Category, type Investment, type Liability, type RealEstate } from '#shared/schemas/financial-plan'
import { monthlyLoanPayment } from '#shared/utils/loan'
import { money } from '@/lib/format'

const props = defineProps<{ category: Category; entry?: CashFlow | Investment | Liability | RealEstate; investments: Investment[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ save: [entry: CashFlow | Investment | Liability | RealEstate] }>()
const singular: Record<Category, string> = { incomes: 'income', investments: 'investment', expenses: 'expense', liabilities: 'liability', realEstate: 'property' }
const form = reactive({ name: '', amount: '0', frequency: 'monthly', balance: '0', annualRoi: '5', allocation: '0', allocationMode: 'percentage', monthlyContribution: '0', apr: '0', payment: '0', type: 'debt', termYears: '5', propertyValue: '0', annualAppreciation: '3', loanBalance: '0', loanApr: '6', loanTermYears: '30' })
const error = ref('')
const viewport = ref<Record<string, string>>({})
const isFlow = computed(() => props.category === 'incomes' || props.category === 'expenses')
const availableAllocation = computed(() => Math.max(0, 100 - props.investments.filter(item => item.id !== props.entry?.id).reduce((total, item) => total + investmentAllocation(item, props.investments), 0)))
const loanPayment = computed(() => monthlyLoanPayment(Math.round(Number(form.balance) * 100), Number(form.apr), Number(form.termYears) * 12))
const propertyLoanCents = computed(() => Math.round(Number(form.loanBalance) * 100) || 0)
const propertyLoanPayment = computed(() => monthlyLoanPayment(propertyLoanCents.value, Number(form.loanApr), Math.round(Number(form.loanTermYears) * 12)))
const propertyEquity = computed(() => (Math.round(Number(form.propertyValue) * 100) || 0) - propertyLoanCents.value)
const frequencies = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'annual', label: 'Annually' },
]

watch(open, (value) => {
  if (!value) return
  error.value = ''
  const entry = props.entry
  Object.assign(form, {
    name: entry?.name ?? '',
    amount: entry && 'amount' in entry ? String(entry.amount / 100) : '',
    frequency: entry && 'frequency' in entry ? entry.frequency : 'monthly',
    balance: entry && 'balance' in entry ? String(entry.balance / 100) : '',
    annualRoi: entry && 'annualRoi' in entry ? String(entry.annualRoi) : '5',
    allocation: entry && 'annualRoi' in entry ? String(investmentAllocation(entry, props.investments)) : String(availableAllocation.value),
    allocationMode: entry && 'annualRoi' in entry && entry.monthlyContribution !== undefined ? 'monthly' : 'percentage',
    monthlyContribution: entry && 'annualRoi' in entry && entry.monthlyContribution !== undefined ? String(entry.monthlyContribution / 100) : '0',
    apr: entry && 'apr' in entry ? String(entry.apr) : '0',
    payment: entry && 'payment' in entry ? String(entry.payment / 100) : '',
    type: entry && 'type' in entry ? entry.type ?? 'debt' : 'debt',
    termYears: entry && 'termMonths' in entry && entry.termMonths ? String(entry.termMonths / 12) : '5',
    propertyValue: entry && 'value' in entry ? String(entry.value / 100) : '',
    annualAppreciation: entry && 'annualAppreciation' in entry ? String(entry.annualAppreciation) : '3',
    loanBalance: entry && 'value' in entry && entry.loan ? String(entry.loan.balance / 100) : '0',
    loanApr: entry && 'value' in entry && entry.loan ? String(entry.loan.apr) : '6',
    loanTermYears: entry && 'value' in entry && entry.loan ? String(entry.loan.termMonths / 12) : '30',
  })
  updateViewport()
})

function selectFrequency(value: unknown) {
  if (typeof value === 'string' && frequencies.some(option => option.value === value)) form.frequency = value
}

function updateViewport() {
  if (import.meta.server) return
  const visual = window.visualViewport
  const height = visual?.height ?? window.innerHeight
  const offset = visual ? Math.max(0, window.innerHeight - visual.height - visual.offsetTop) : 0
  viewport.value = { '--income-drawer-viewport': `${height}px`, '--income-drawer-offset': `${offset}px` }
}

onMounted(() => {
  updateViewport()
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('scroll', updateViewport)
  window.addEventListener('resize', updateViewport)
})

onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', updateViewport)
  window.visualViewport?.removeEventListener('scroll', updateViewport)
  window.removeEventListener('resize', updateViewport)
})

function submit() {
  if (props.category === 'investments' && form.allocationMode === 'percentage' && Number(form.allocation) > availableAllocation.value + 1e-8) {
    error.value = `Allocations cannot exceed 100%. Up to ${availableAllocation.value.toFixed(2)}% is available for this investment.`
    return
  }
  const base = { id: props.entry?.id ?? crypto.randomUUID(), name: form.name }
  if (props.category === 'realEstate') {
    const loan = propertyLoanCents.value > 0 ? { balance: propertyLoanCents.value, apr: Number(form.loanApr), termMonths: Math.round(Number(form.loanTermYears) * 12), payment: propertyLoanPayment.value } : undefined
    const parsed = realEstateSchema.safeParse({ ...base, value: Math.round(Number(form.propertyValue) * 100), annualAppreciation: Number(form.annualAppreciation), ...(loan ? { loan } : {}) })
    if (!parsed.success) {
      error.value = parsed.error.issues.map(issue => `${issue.path.join(' ')}: ${issue.message}`).join('. ')
      return
    }
    emit('save', parsed.data)
    open.value = false
    return
  }
  const schema = isFlow.value ? cashFlowSchema : props.category === 'investments' ? investmentSchema : liabilitySchema
  const value = isFlow.value
    ? { ...base, amount: Math.round(Number(form.amount) * 100), frequency: form.frequency }
    : props.category === 'investments'
      ? { ...base, balance: Math.round(Number(form.balance) * 100), annualRoi: Number(form.annualRoi), ...(form.allocationMode === 'monthly' ? { monthlyContribution: Math.round(Number(form.monthlyContribution) * 100) } : { allocation: Number(form.allocation) }) }
      : { ...base, balance: Math.round(Number(form.balance) * 100), apr: Number(form.apr), payment: form.type === 'loan' ? loanPayment.value : Math.round(Number(form.payment) * 100), ...(form.type === 'loan' ? { type: 'loan' as const, termMonths: Number(form.termYears) * 12 } : {}) }
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    error.value = parsed.error.issues.map(issue => `${issue.path.join(' ')}: ${issue.message}`).join('. ')
    return
  }
  emit('save', parsed.data)
  open.value = false
}
</script>

<template>
  <Drawer v-model:open="open" :should-scale-background="false">
    <DrawerContent class="income-drawer financial-entry-drawer" :style="viewport" aria-describedby="financial-entry-description">
      <DrawerHeader class="income-drawer-header">
        <DrawerTitle>{{ entry ? 'Edit' : 'Add' }} {{ singular[category] }}</DrawerTitle>
        <DrawerDescription id="financial-entry-description">{{ category === 'incomes' ? 'Take-home income, after taxes.' : category === 'investments' ? 'Current value and expected effective annual return.' : category === 'liabilities' ? 'Outstanding debt and its scheduled repayment.' : category === 'realEstate' ? 'Market value and any loan secured against it. Equity grows as the loan is repaid.' : 'Recurring spending, excluding debt payments entered under liabilities.' }}</DrawerDescription>
      </DrawerHeader>
      <form id="financial-entry-form" class="entry-form income-drawer-body" @submit.prevent="submit">
        <div class="field"><Label for="entry-name">Name</Label><Input id="entry-name" v-model="form.name" required maxlength="100" autocomplete="off" :placeholder="category === 'investments' ? 'e.g. Index fund' : category === 'incomes' ? 'e.g. Salary' : category === 'expenses' ? 'e.g. Housing' : category === 'realEstate' ? 'e.g. Family home' : 'e.g. Student loan'" /></div>
        <template v-if="isFlow">
          <div class="field">
            <Label for="entry-amount">Amount (USD)</Label>
            <div class="income-amount"><span class="income-amount-prefix" aria-hidden="true">$</span><Input id="entry-amount" v-model="form.amount" class="pl-7" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" placeholder="0.00" /></div>
          </div>
          <div class="field">
            <Label id="entry-frequency-label" as="span">Frequency</Label>
            <ToggleGroup type="single" variant="outline" class="income-frequency" :model-value="form.frequency" aria-labelledby="entry-frequency-label" @update:model-value="selectFrequency">
              <ToggleGroupItem v-for="option in frequencies" :key="option.value" :value="option.value">{{ option.label }}</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </template>
        <template v-else-if="category === 'realEstate'">
          <fieldset class="entry-fieldset">
            <legend>Property</legend>
            <div class="form-columns">
              <div class="field"><Label for="entry-property-value">Market value (USD)</Label><Input id="entry-property-value" v-model="form.propertyValue" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" /></div>
              <div class="field"><Label for="entry-appreciation">Annual appreciation (%)</Label><Input id="entry-appreciation" v-model="form.annualAppreciation" type="number" min="-100" max="1000" step="0.01" required inputmode="decimal" /></div>
            </div>
          </fieldset>
          <fieldset class="entry-fieldset">
            <legend>Loan</legend>
            <div class="field"><Label for="entry-loan-balance">Outstanding balance (USD)</Label><Input id="entry-loan-balance" v-model="form.loanBalance" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" /><span class="muted">Enter 0 if the property is owned outright.</span></div>
            <div v-if="propertyLoanCents > 0" class="form-columns">
              <div class="field"><Label for="entry-loan-apr">Interest APR (%)</Label><Input id="entry-loan-apr" v-model="form.loanApr" type="number" min="0" max="1000" step="0.01" required inputmode="decimal" /></div>
              <div class="field"><Label for="entry-loan-term">Remaining term (years)</Label><Input id="entry-loan-term" v-model="form.loanTermYears" type="number" min="0.08333333333333333" max="40" step="any" required inputmode="decimal" /></div>
            </div>
          </fieldset>
          <div class="income-projection property-summary" role="status" aria-live="polite">
            <div><span>Equity today</span><strong :class="{ negative: propertyEquity < 0 }" data-testid="property-equity">{{ money(propertyEquity, true) }}</strong></div>
            <div><span>Monthly loan payment</span><strong data-testid="property-payment">{{ propertyLoanCents > 0 ? (Number.isFinite(propertyLoanPayment) ? money(propertyLoanPayment, true) : '—') : money(0, true) }}</strong></div>
          </div>
        </template>
        <template v-else>
          <div class="field"><Label for="entry-balance">{{ category === 'investments' ? 'Current value' : 'Outstanding balance' }} (USD)</Label><Input id="entry-balance" v-model="form.balance" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" /></div>
          <template v-if="category === 'investments'">
            <div class="field"><Label for="entry-roi">Annual ROI (%)</Label><Input id="entry-roi" v-model="form.annualRoi" type="number" min="-100" max="1000" step="0.01" required inputmode="decimal" /></div>
            <Tabs v-model="form.allocationMode">
              <TabsList class="w-full" aria-label="Allocation type"><TabsTrigger value="percentage" class="flex-1">% of surplus</TabsTrigger><TabsTrigger value="monthly" class="flex-1">$ per month</TabsTrigger></TabsList>
              <TabsContent value="percentage"><div class="field"><Label for="entry-allocation">Surplus allocation (%)</Label><Input id="entry-allocation" v-model="form.allocation" type="number" min="0" max="100" step="any" required inputmode="decimal" /><span class="muted">{{ availableAllocation.toFixed(2) }}% available after monthly dollar targets</span></div></TabsContent>
              <TabsContent value="monthly"><div class="field"><Label for="entry-contribution">Monthly contribution (USD)</Label><Input id="entry-contribution" v-model="form.monthlyContribution" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" /></div></TabsContent>
            </Tabs>
          </template>
          <template v-else>
            <div class="field"><Label for="entry-type">Liability type</Label><Select v-model="form.type"><SelectTrigger id="entry-type" class="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="debt">Other debt</SelectItem><SelectItem value="loan">Loan</SelectItem></SelectContent></Select></div>
            <div class="form-columns">
              <div class="field"><Label for="entry-apr">Interest APR (%)</Label><Input id="entry-apr" v-model="form.apr" type="number" min="0" max="1000" step="0.01" required inputmode="decimal" /></div>
              <div v-if="form.type === 'loan'" class="field"><Label for="entry-term">Loan duration (years)</Label><Input id="entry-term" v-model="form.termYears" type="number" min="0.08333333333333333" max="40" step="any" required inputmode="decimal" /></div>
              <div v-else class="field"><Label for="entry-payment">Monthly payment (USD)</Label><Input id="entry-payment" v-model="form.payment" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" /></div>
            </div>
            <p v-if="form.type === 'loan' && Number.isFinite(loanPayment)" class="muted" role="status">Calculated monthly payment: {{ money(loanPayment, true) }}</p>
          </template>
        </template>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      </form>
      <DrawerFooter class="income-drawer-footer">
        <Button type="submit" form="financial-entry-form" class="w-full">{{ entry ? 'Apply changes' : `Add ${singular[category]}` }}</Button>
        <DrawerClose as-child><Button type="button" variant="outline" class="w-full">Cancel</Button></DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>