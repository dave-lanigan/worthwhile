<script setup lang="ts">
import { Check, Plus, X } from 'lucide-vue-next'
import { cashFlowSchema, investmentAllocation, investmentSchema, liabilitySchema, type CashFlow, type Category, type Investment, type Liability } from '#shared/schemas/financial-plan'

const props = defineProps<{ category: Category; entry?: CashFlow | Investment | Liability; investments: Investment[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ save: [entry: CashFlow | Investment | Liability] }>()
const singular: Record<Category, string> = { incomes: 'income', investments: 'investment', expenses: 'expense', liabilities: 'liability' }
const form = reactive({ name: '', amount: '0', frequency: 'monthly', balance: '0', annualRoi: '5', allocation: '0', allocationMode: 'percentage', monthlyContribution: '0', apr: '0', payment: '0' })
const error = ref('')
const isFlow = computed(() => props.category === 'incomes' || props.category === 'expenses')
const availableAllocation = computed(() => Math.max(0, 100 - props.investments.filter(item => item.id !== props.entry?.id).reduce((total, item) => total + investmentAllocation(item, props.investments), 0)))

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
  })
})

function submit() {
  if (props.category === 'investments' && form.allocationMode === 'percentage' && Number(form.allocation) > availableAllocation.value + 1e-8) {
    error.value = `Allocations cannot exceed 100%. Up to ${availableAllocation.value.toFixed(2)}% is available for this investment.`
    return
  }
  const base = { id: props.entry?.id ?? crypto.randomUUID(), name: form.name }
  const schema = isFlow.value ? cashFlowSchema : props.category === 'investments' ? investmentSchema : liabilitySchema
  const value = isFlow.value
    ? { ...base, amount: Math.round(Number(form.amount) * 100), frequency: form.frequency }
    : props.category === 'investments'
      ? { ...base, balance: Math.round(Number(form.balance) * 100), annualRoi: Number(form.annualRoi), ...(form.allocationMode === 'monthly' ? { monthlyContribution: Math.round(Number(form.monthlyContribution) * 100) } : { allocation: Number(form.allocation) }) }
      : { ...base, balance: Math.round(Number(form.balance) * 100), apr: Number(form.apr), payment: Math.round(Number(form.payment) * 100) }
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
  <Dialog v-model:open="open">
    <DialogContent class="entry-dialog" :show-close-button="false">
      <DialogHeader class="entry-dialog-header">
        <DialogTitle>{{ entry ? 'Edit' : 'Add' }} {{ singular[category] }}</DialogTitle>
        <DialogDescription>{{ category === 'incomes' ? 'Take-home income, after taxes.' : category === 'investments' ? 'Current value and expected effective annual return.' : category === 'liabilities' ? 'Outstanding debt and its scheduled repayment.' : 'Recurring spending, excluding debt payments entered under liabilities.' }}</DialogDescription>
      </DialogHeader>
      <div class="entry-dialog-actions">
        <Button type="submit" form="financial-entry-form" variant="outline" size="icon" aria-label="Save changes"><Check :size="19" /></Button>
        <Button type="button" variant="outline" size="icon" aria-label="Close dialog" @click="open = false"><X :size="19" /></Button>
      </div>
      <form id="financial-entry-form" class="entry-form" @submit.prevent="submit">
        <div class="field entry-name-field"><Label for="entry-name">Name</Label><Input id="entry-name" v-model="form.name" required maxlength="100" autocomplete="off" :placeholder="category === 'investments' ? 'e.g. Index fund' : category === 'incomes' ? 'e.g. Salary' : category === 'expenses' ? 'e.g. Housing' : 'e.g. Student loan'" /></div>
        <template v-if="isFlow">
          <div class="form-columns">
            <div class="field"><Label for="entry-amount">Amount (USD)</Label><Input id="entry-amount" v-model="form.amount" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" /></div>
            <div class="field"><Label for="entry-frequency">Frequency</Label><Select v-model="form.frequency"><SelectTrigger id="entry-frequency" class="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="annual">Annual</SelectItem></SelectContent></Select></div>
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
          <div v-else class="form-columns">
            <div class="field"><Label for="entry-apr">Interest APR (%)</Label><Input id="entry-apr" v-model="form.apr" type="number" min="0" max="1000" step="0.01" required inputmode="decimal" /></div>
            <div class="field"><Label for="entry-payment">Monthly payment (USD)</Label><Input id="entry-payment" v-model="form.payment" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" /></div>
          </div>
        </template>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      </form>
    </DialogContent>
  </Dialog>
</template>