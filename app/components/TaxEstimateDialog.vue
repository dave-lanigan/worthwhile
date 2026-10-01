<script setup lang="ts">
import type { UserProfile } from '#shared/schemas/financial-plan'
import { estimateTaxes, stateFromAddress, TAX_YEAR } from '#shared/utils/taxes'
import { money } from '@/lib/format'

const props = defineProps<{ profile: UserProfile; annualIncome: number }>()
const open = defineModel<boolean>('open', { default: false })
const form = reactive({ status: 'single' as UserProfile['taxFilingStatus'], state: '', deductions: '0', exemptions: '0' })
const result = ref<ReturnType<typeof estimateTaxes>>(null)
const error = ref('')

watch(open, value => {
  if (!value) return
  form.status = props.profile.taxFilingStatus
  form.state = stateFromAddress(props.profile.address) ?? ''
  form.deductions = '0'
  form.exemptions = '0'
  result.value = null
  error.value = ''
})

function calculate() {
  const deductions = Number(form.deductions) * 100
  const exemptions = Number(form.exemptions) * 100
  result.value = estimateTaxes(props.annualIncome, form.status, form.state.trim().toUpperCase(), Math.round(deductions), Math.round(exemptions))
  error.value = result.value ? '' : 'Enter a valid two-letter U.S. state and nonnegative deduction and exemption amounts.'
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="entry-dialog">
      <DialogHeader class="entry-dialog-header">
        <DialogTitle>Estimate income tax</DialogTitle>
        <DialogDescription>Basic {{ TAX_YEAR }} federal and state estimate from your annual income entries.</DialogDescription>
      </DialogHeader>
      <form class="entry-form" @submit.prevent="calculate">
        <div class="field entry-name-field"><Label for="tax-status">Filing status</Label><Select v-model="form.status"><SelectTrigger id="tax-status" class="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single">Single</SelectItem><SelectItem value="married-jointly">Married filing jointly</SelectItem><SelectItem value="married-separately">Married filing separately</SelectItem><SelectItem value="head-of-household">Head of household</SelectItem></SelectContent></Select></div>
        <div class="form-columns">
          <div class="field"><Label for="tax-state">State of residence (2 letters)</Label><Input id="tax-state" v-model="form.state" maxlength="2" required autocomplete="address-level1" placeholder="e.g. TX" /></div>
          <div class="field"><Label for="tax-income">Annual income</Label><Input id="tax-income" :model-value="money(annualIncome, true)" readonly /></div>
        </div>
        <div class="form-columns">
          <div class="field"><Label for="tax-deductions">Itemized deductions (USD)</Label><Input id="tax-deductions" v-model="form.deductions" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" /></div>
          <div class="field"><Label for="tax-exemptions">Additional exemptions (USD)</Label><Input id="tax-exemptions" v-model="form.exemptions" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" /></div>
        </div>
        <p class="muted">Uses the greater of the {{ TAX_YEAR }} federal standard deduction or your itemized deductions. State tax uses a simplified rate, not state-specific brackets or deductions. Payroll taxes, credits and local taxes are excluded. Income entries are already treated as take-home pay in the forecast; this estimate does not change it.</p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div v-if="result" role="status" class="tax-result">
          <div><span>Federal estimate</span><strong>{{ money(result.federalTax, true) }}</strong></div>
          <div><span>{{ form.state.toUpperCase() }} state estimate</span><strong>{{ money(result.stateTax, true) }}</strong></div>
          <div><span>Estimated annual total</span><strong>{{ money(result.total, true) }}</strong></div>
        </div>
        <DialogFooter><Button type="button" variant="outline" @click="open = false">Cancel</Button><Button type="submit">Calculate taxes</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
