<script setup lang="ts">
import { TAX_YEAR, type TaxInputs } from '#shared/utils/taxes'
import type { estimateTaxes } from '#shared/utils/taxes'
import { money } from '@/lib/format'

defineProps<{ result: ReturnType<typeof estimateTaxes> }>()
const open = defineModel<boolean>('open', { default: false })
const inputs = defineModel<TaxInputs>('inputs', { required: true })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="entry-dialog">
      <DialogHeader class="entry-dialog-header">
        <DialogTitle>Tax details</DialogTitle>
        <DialogDescription>Your {{ TAX_YEAR }} estimate uses income from your plan and your profile address. Adjust filing status, deductions and exemptions here.</DialogDescription>
      </DialogHeader>
      <div class="entry-form">
        <div class="field entry-name-field"><Label for="tax-status">Filing status</Label><Select v-model="inputs.status"><SelectTrigger id="tax-status" class="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single">Single</SelectItem><SelectItem value="married-jointly">Married filing jointly</SelectItem><SelectItem value="married-separately">Married filing separately</SelectItem><SelectItem value="head-of-household">Head of household</SelectItem></SelectContent></Select></div>
        <div class="form-columns">
          <div class="field"><Label for="tax-deductions">Itemized deductions (USD)</Label><Input id="tax-deductions" v-model="inputs.deductions" type="number" min="0" max="1000000000000" step="0.01" inputmode="decimal" /></div>
          <div class="field"><Label for="tax-exemptions">Additional exemptions (USD)</Label><Input id="tax-exemptions" v-model="inputs.exemptions" type="number" min="0" max="1000000000000" step="0.01" inputmode="decimal" /></div>
        </div>
        <p class="muted">Updates automatically. Uses the greater of the {{ TAX_YEAR }} federal standard deduction or your itemized deductions. State tax uses a simplified rate, not state-specific brackets or deductions. Payroll taxes, credits and local taxes are excluded. Income entries are already treated as take-home pay in the forecast; this estimate does not change it. Adjustments are temporary.</p>
        <p v-if="!inputs.state" class="form-error" role="alert">A state could not be found in your profile address. <NuxtLink to="/user" @click="open = false">Update your address</NuxtLink> to see a tax estimate.</p>
        <p v-else-if="!result" class="form-error" role="alert">Enter nonnegative deduction and exemption amounts to see the estimate.</p>
        <div v-if="result" role="status" class="tax-result">
          <div><span>Federal estimate</span><strong>{{ money(result.federalTax, true) }}</strong></div>
          <div><span>{{ inputs.state.toUpperCase() }} state estimate</span><strong>{{ money(result.stateTax, true) }}</strong></div>
          <div><span>Estimated annual total</span><strong>{{ money(result.total, true) }}</strong></div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
