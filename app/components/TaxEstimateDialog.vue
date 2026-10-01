<script setup lang="ts">
import { TAX_YEAR, type TaxInputs } from '#shared/utils/taxes'
import type { estimateTaxes } from '#shared/utils/taxes'
import { money } from '@/lib/format'

defineProps<{ annualIncome: number; result: ReturnType<typeof estimateTaxes> }>()
const open = defineModel<boolean>('open', { default: false })
const inputs = defineModel<TaxInputs>('inputs', { required: true })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="entry-dialog">
      <DialogHeader class="entry-dialog-header">
        <DialogTitle>Estimate income tax</DialogTitle>
        <DialogDescription>Basic {{ TAX_YEAR }} federal and state estimate from your annual income entries.</DialogDescription>
      </DialogHeader>
      <div class="entry-form">
        <div class="field entry-name-field"><Label for="tax-status">Filing status</Label><Select v-model="inputs.status"><SelectTrigger id="tax-status" class="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single">Single</SelectItem><SelectItem value="married-jointly">Married filing jointly</SelectItem><SelectItem value="married-separately">Married filing separately</SelectItem><SelectItem value="head-of-household">Head of household</SelectItem></SelectContent></Select></div>
        <div class="form-columns">
          <div class="field"><Label for="tax-state">State of residence (2 letters)</Label><Input id="tax-state" v-model="inputs.state" maxlength="2" autocomplete="address-level1" placeholder="e.g. TX" /></div>
          <div class="field"><Label for="tax-income">Annual income</Label><Input id="tax-income" :model-value="money(annualIncome, true)" readonly /></div>
        </div>
        <div class="form-columns">
          <div class="field"><Label for="tax-deductions">Itemized deductions (USD)</Label><Input id="tax-deductions" v-model="inputs.deductions" type="number" min="0" max="1000000000000" step="0.01" inputmode="decimal" /></div>
          <div class="field"><Label for="tax-exemptions">Additional exemptions (USD)</Label><Input id="tax-exemptions" v-model="inputs.exemptions" type="number" min="0" max="1000000000000" step="0.01" inputmode="decimal" /></div>
        </div>
        <p class="muted">Updates automatically. Uses the greater of the {{ TAX_YEAR }} federal standard deduction or your itemized deductions. State tax uses a simplified rate, not state-specific brackets or deductions. Payroll taxes, credits and local taxes are excluded. Income entries are already treated as take-home pay in the forecast; this estimate does not change it. Adjustments are temporary.</p>
        <p v-if="!result" class="form-error" role="alert">Enter a valid two-letter U.S. state and nonnegative deduction and exemption amounts to see the estimate.</p>
        <div v-if="result" role="status" class="tax-result">
          <div><span>Federal estimate</span><strong>{{ money(result.federalTax, true) }}</strong></div>
          <div><span>{{ inputs.state.toUpperCase() }} state estimate</span><strong>{{ money(result.stateTax, true) }}</strong></div>
          <div><span>Estimated annual total</span><strong>{{ money(result.total, true) }}</strong></div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
