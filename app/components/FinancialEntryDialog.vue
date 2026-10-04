<script setup lang="ts">
import { cashFlowSchema, investmentAllocation, investmentSchema, liabilitySchema, realEstateSchema, type CashFlow, type Category, type Investment, type Liability, type RealEstate } from '#shared/schemas/financial-plan'
import { monthlyLoanPayment } from '#shared/utils/loan'
import { money } from '@/lib/format'

const props = defineProps<{ category: Category; entry?: CashFlow | Investment | Liability | RealEstate; investments: Investment[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ save: [entry: CashFlow | Investment | Liability | RealEstate] }>()
const singular: Record<Category, string> = { incomes: 'income', investments: 'investment', expenses: 'expense', liabilities: 'liability' }
const form = reactive({ name: '', amount: '0', frequency: 'monthly', balance: '0', annualRoi: '5', allocation: '0', allocationMode: 'percentage', monthlyContribution: '0', apr: '0', payment: '0', type: 'debt', termYears: '5', propertyValue: '0', annualAppreciation: '3', loanBalance: '0', loanApr: '6', loanTermYears: '30', assetType: 'investment' })
const error = ref('')
const lookupMode = ref('manual')
const valuation = ref<RealEstate['valuation']>()
const details = reactive({ vin: '', year: '', make: '', model: '', trim: '', mileage: '', zip: '', address: '', bedrooms: '', bathrooms: '', squareFootage: '', yearBuilt: '' })
const { loading: valuing, notice: valuationNotice, lookup, cancel: cancelLookup } = useAssetValuation()
const viewport = ref<Record<string, string>>({})
const isFlow = computed(() => props.category === 'incomes' || props.category === 'expenses')
const isProperty = computed(() => props.category === 'investments' && form.assetType === 'property')
const isCar = computed(() => props.category === 'investments' && form.assetType === 'car')
const isPhysicalAsset = computed(() => isProperty.value || isCar.value)
const entryLabel = computed(() => isCar.value ? 'car' : isProperty.value ? 'property' : singular[props.category])
const attribution = computed(() => valuation.value ? `Estimate via ${valuation.value.source} · ${new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(valuation.value.fetchedAt))}` : '')
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
  cancelLookup()
  if (!value) return
  error.value = ''
  lookupMode.value = 'manual'
  const entry = props.entry
  valuation.value = entry && 'value' in entry ? entry.valuation : undefined
  for (const key of Object.keys(details) as (keyof typeof details)[]) details[key] = ''
  if (entry && 'value' in entry) {
    const storedDetails = { ...entry.vehicle, ...entry.propertyDetails }
    for (const key of Object.keys(details) as (keyof typeof details)[]) details[key] = String(storedDetails[key as keyof typeof storedDetails] ?? '')
  }
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
    assetType: entry && 'value' in entry ? entry.assetType ?? 'property' : 'investment',
    propertyValue: entry && 'value' in entry ? String(entry.value / 100) : '',
    annualAppreciation: entry && 'annualAppreciation' in entry ? String(entry.annualAppreciation) : '3',
    loanBalance: entry && 'value' in entry && entry.loan ? String(entry.loan.balance / 100) : '0',
    loanApr: entry && 'value' in entry && entry.loan ? String(entry.loan.apr) : '6',
    loanTermYears: entry && 'value' in entry && entry.loan ? String(entry.loan.termMonths / 12) : '30',
  })
  updateViewport()
})

watch(lookupMode, cancelLookup)
watch(() => form.assetType, (value, previous) => {
  cancelLookup()
  if (props.entry || !open.value || value === previous) return
  valuation.value = undefined
  lookupMode.value = 'manual'
  form.annualAppreciation = value === 'car' ? '-15' : '3'
})

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : undefined
}

async function lookUpValue() {
  const originalValue = form.propertyValue
  const originalName = form.name
  const result = await lookup(isCar.value
    ? { type: 'car', vin: details.vin.trim().toUpperCase(), mileage: details.mileage.trim() ? Number(details.mileage) : NaN, zip: details.zip.trim() }
    : { type: 'property', address: details.address.trim() })
  if (!result) return
  const fetchedDetails = { ...result.vehicle, ...result.propertyDetails }
  for (const key of Object.keys(details) as (keyof typeof details)[]) {
    const value = fetchedDetails[key as keyof typeof fetchedDetails]
    if (value !== undefined) details[key] = String(value)
  }
  if (!originalName && form.name === originalName) {
    form.name = isCar.value ? [details.year, details.make, details.model].filter(Boolean).join(' ').slice(0, 100) : details.address.slice(0, 100)
  }
  if (result.value !== undefined && result.source && result.fetchedAt) {
    if (form.propertyValue === originalValue) form.propertyValue = String(result.value / 100)
    valuation.value = { source: result.source, fetchedAt: result.fetchedAt, value: result.value }
  }
}

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
  if (props.category === 'investments' && !isPhysicalAsset.value && form.allocationMode === 'percentage' && Number(form.allocation) > availableAllocation.value + 1e-8) {
    error.value = `Allocations cannot exceed 100%. Up to ${availableAllocation.value.toFixed(2)}% is available for this investment.`
    return
  }
  const base = { id: props.entry?.id ?? crypto.randomUUID(), name: form.name }
  if (isPhysicalAsset.value) {
    const loan = isProperty.value && propertyLoanCents.value > 0 ? { balance: propertyLoanCents.value, apr: Number(form.loanApr), termMonths: Math.round(Number(form.loanTermYears) * 12), payment: propertyLoanPayment.value } : undefined
    const vin = details.vin.trim().toUpperCase()
    const vehicle = isCar.value ? { vin: /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : undefined, year: optionalNumber(details.year), make: details.make.trim() || undefined, model: details.model.trim() || undefined, trim: details.trim.trim() || undefined, mileage: optionalNumber(details.mileage), zip: /^\d{5}$/.test(details.zip.trim()) ? details.zip.trim() : undefined } : undefined
    const propertyDetails = isProperty.value ? { address: details.address.trim() || undefined, bedrooms: optionalNumber(details.bedrooms), bathrooms: optionalNumber(details.bathrooms), squareFootage: optionalNumber(details.squareFootage), yearBuilt: optionalNumber(details.yearBuilt) } : undefined
    const parsed = realEstateSchema.safeParse({ ...base, assetType: form.assetType, value: Math.round(Number(form.propertyValue) * 100), annualAppreciation: Number(form.annualAppreciation), vehicle, propertyDetails, valuation: valuation.value, ...(loan ? { loan } : {}) })
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
        <DrawerTitle>{{ entry ? 'Edit' : 'Add' }} {{ entryLabel }}</DrawerTitle>
        <DrawerDescription id="financial-entry-description">{{ category === 'incomes' ? 'Take-home income, after taxes.' : isCar ? 'Enter a value or look up an editable estimate for your car.' : isProperty ? 'Market value and any loan secured against it. Equity grows as the loan is repaid.' : category === 'investments' ? 'Current value and expected effective annual return.' : category === 'liabilities' ? 'Outstanding debt and its scheduled repayment.' : 'Recurring spending, excluding debt payments entered under liabilities.' }}</DrawerDescription>
      </DrawerHeader>
      <form id="financial-entry-form" class="entry-form income-drawer-body" @submit.prevent="submit">
        <div class="field"><Label for="entry-name">Name</Label><Input id="entry-name" v-model="form.name" required maxlength="100" autocomplete="off" :placeholder="isCar ? 'e.g. Family car' : isProperty ? 'e.g. Family home' : category === 'investments' ? 'e.g. Index fund' : category === 'incomes' ? 'e.g. Salary' : category === 'expenses' ? 'e.g. Housing' : 'e.g. Student loan'" /></div>
        <div v-if="category === 'investments'" class="field"><Label for="entry-asset-type">Asset type</Label><Select v-model="form.assetType" :disabled="!!entry"><SelectTrigger id="entry-asset-type" class="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="investment">Investment account</SelectItem><SelectItem value="property">Real estate</SelectItem><SelectItem value="car">Car</SelectItem></SelectContent></Select></div>
        <template v-if="isPhysicalAsset">
          <Tabs v-model="lookupMode">
            <TabsList class="w-full" aria-label="Valuation method"><TabsTrigger value="manual" class="flex-1">Enter manually</TabsTrigger><TabsTrigger value="lookup" class="flex-1">{{ isCar ? 'Look up by VIN' : 'Look up by address' }}</TabsTrigger></TabsList>
            <TabsContent value="lookup" class="flex flex-col gap-4">
              <div v-if="isCar" class="field"><Label for="entry-vin">VIN</Label><Input id="entry-vin" v-model="details.vin" maxlength="17" autocomplete="off" placeholder="17-character VIN" :disabled="valuing" /></div>
              <div v-else class="field"><Label for="entry-address">Street address</Label><Input id="entry-address" v-model="details.address" maxlength="300" autocomplete="street-address" placeholder="Street, city, state, ZIP" :disabled="valuing" /></div>
              <div v-if="isCar" class="form-columns">
                <div class="field"><Label for="entry-mileage">Mileage</Label><Input id="entry-mileage" v-model="details.mileage" type="number" min="0" step="1" inputmode="numeric" :disabled="valuing" /></div>
                <div class="field"><Label for="entry-zip">ZIP code</Label><Input id="entry-zip" v-model="details.zip" maxlength="5" inputmode="numeric" autocomplete="postal-code" :disabled="valuing" /></div>
              </div>
              <p v-if="isCar" class="muted">Mileage and ZIP code are needed for a market estimate.</p>
              <Button type="button" class="w-full" :disabled="valuing" @click="lookUpValue">{{ valuing ? 'Looking up…' : valuation ? 'Refresh estimate' : 'Look up estimate' }}</Button>
            </TabsContent>
          </Tabs>
          <Button v-if="valuation && lookupMode === 'manual'" type="button" size="sm" :disabled="valuing" @click="lookUpValue">{{ valuing ? 'Looking up…' : 'Refresh estimate' }}</Button>
          <p v-if="valuationNotice" class="muted" role="status">{{ valuationNotice }}</p>
        </template>
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
        <template v-else-if="isPhysicalAsset">
          <fieldset class="entry-fieldset">
            <legend>{{ isCar ? 'Car' : 'Property' }}</legend>
            <div class="form-columns">
              <div class="field"><Label for="entry-property-value">Market value (USD)</Label><Input id="entry-property-value" v-model="form.propertyValue" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" /><span v-if="attribution" class="muted">{{ attribution }}</span></div>
              <div class="field"><Label for="entry-appreciation">Annual appreciation (%)</Label><Input id="entry-appreciation" v-model="form.annualAppreciation" type="number" min="-100" max="1000" step="0.01" required inputmode="decimal" /></div>
            </div>
          </fieldset>
          <fieldset class="entry-fieldset">
            <legend>Optional details</legend>
            <template v-if="isCar">
              <div class="form-columns">
                <div class="field"><Label for="entry-car-year">Year</Label><Input id="entry-car-year" v-model="details.year" type="number" min="1886" max="2100" step="1" inputmode="numeric" /></div>
                <div class="field"><Label for="entry-car-make">Make</Label><Input id="entry-car-make" v-model="details.make" maxlength="100" /></div>
              </div>
              <div class="form-columns">
                <div class="field"><Label for="entry-car-model">Model</Label><Input id="entry-car-model" v-model="details.model" maxlength="100" /></div>
                <div class="field"><Label for="entry-car-trim">Trim</Label><Input id="entry-car-trim" v-model="details.trim" maxlength="100" /></div>
              </div>
            </template>
            <template v-else>
              <div class="form-columns">
                <div class="field"><Label for="entry-beds">Bedrooms</Label><Input id="entry-beds" v-model="details.bedrooms" type="number" min="0" step="1" inputmode="numeric" /></div>
                <div class="field"><Label for="entry-baths">Bathrooms</Label><Input id="entry-baths" v-model="details.bathrooms" type="number" min="0" step="0.5" inputmode="decimal" /></div>
              </div>
              <div class="form-columns">
                <div class="field"><Label for="entry-sqft">Square footage</Label><Input id="entry-sqft" v-model="details.squareFootage" type="number" min="0" step="1" inputmode="numeric" /></div>
                <div class="field"><Label for="entry-year-built">Year built</Label><Input id="entry-year-built" v-model="details.yearBuilt" type="number" min="1000" max="2100" step="1" inputmode="numeric" /></div>
              </div>
            </template>
          </fieldset>
          <fieldset v-if="isProperty" class="entry-fieldset">
            <legend>Loan</legend>
            <div class="field"><Label for="entry-loan-balance">Outstanding balance (USD)</Label><Input id="entry-loan-balance" v-model="form.loanBalance" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" /><span class="muted">Enter 0 if the property is owned outright.</span></div>
            <div v-if="propertyLoanCents > 0" class="form-columns">
              <div class="field"><Label for="entry-loan-apr">Interest APR (%)</Label><Input id="entry-loan-apr" v-model="form.loanApr" type="number" min="0" max="1000" step="0.01" required inputmode="decimal" /></div>
              <div class="field"><Label for="entry-loan-term">Remaining term (years)</Label><Input id="entry-loan-term" v-model="form.loanTermYears" type="number" min="0.08333333333333333" max="40" step="any" required inputmode="decimal" /></div>
            </div>
          </fieldset>
          <div v-if="isProperty" class="income-projection property-summary" role="status" aria-live="polite">
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
        <Button type="submit" form="financial-entry-form" class="w-full">{{ entry ? 'Apply changes' : `Add ${entryLabel}` }}</Button>
        <DrawerClose as-child><Button type="button" variant="outline" class="w-full">Cancel</Button></DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>