<script setup lang="ts">
import { cashFlowSchema, type CashFlow } from '#shared/schemas/financial-plan'
import { annualAmount, monthlyAmount } from '#shared/utils/projection'
import { money } from '@/lib/format'

const props = defineProps<{ entry?: CashFlow }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ save: [entry: CashFlow] }>()

type Frequency = CashFlow['frequency']
const frequencies: { value: Frequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'annual', label: 'Annually' },
]

const form = reactive<{ name: string; amount: string; frequency: Frequency }>({ name: '', amount: '', frequency: 'monthly' })
const error = ref('')
const viewport = ref<Record<string, string>>({})

const preview = computed<CashFlow>(() => {
  const amount = Number(form.amount)
  return { id: 'preview', name: 'preview', amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0, frequency: form.frequency }
})
const monthlyEquivalent = computed(() => money(monthlyAmount(preview.value), true))
const annualEquivalent = computed(() => money(annualAmount(preview.value), true))

watch(open, (value) => {
  if (!value) return
  error.value = ''
  Object.assign(form, { name: props.entry?.name ?? '', amount: props.entry ? String(props.entry.amount / 100) : '', frequency: props.entry?.frequency ?? 'monthly' })
  updateViewport()
})

function selectFrequency(value: unknown) {
  if (typeof value === 'string' && frequencies.some(option => option.value === value)) form.frequency = value as Frequency
}

function updateViewport() {
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
  const parsed = cashFlowSchema.safeParse({ id: props.entry?.id ?? crypto.randomUUID(), name: form.name, amount: Math.round(Number(form.amount) * 100), frequency: form.frequency })
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
    <DrawerContent class="income-drawer" :style="viewport" aria-describedby="income-drawer-description">
      <DrawerHeader class="income-drawer-header">
        <DrawerTitle>{{ entry ? 'Edit income' : 'Add income' }}</DrawerTitle>
        <DrawerDescription id="income-drawer-description">Take-home income, after taxes.</DrawerDescription>
      </DrawerHeader>
      <form id="income-entry-form" class="entry-form income-drawer-body" @submit.prevent="submit">
        <div class="field">
          <Label for="income-name">Income source</Label>
          <Input id="income-name" v-model="form.name" required maxlength="100" autocomplete="off" placeholder="e.g. Salary" />
        </div>
        <div class="field">
          <Label for="income-amount">Amount</Label>
          <div class="income-amount">
            <span class="income-amount-prefix" aria-hidden="true">$</span>
            <Input id="income-amount" v-model="form.amount" class="pl-7" type="number" min="0" max="1000000000000" step="0.01" required inputmode="decimal" placeholder="0.00" />
          </div>
        </div>
        <div class="field">
          <Label id="income-frequency-label" as="span">Frequency</Label>
          <ToggleGroup type="single" variant="outline" class="income-frequency" :model-value="form.frequency" aria-labelledby="income-frequency-label" @update:model-value="selectFrequency">
            <ToggleGroupItem v-for="option in frequencies" :key="option.value" :value="option.value">{{ option.label }}</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div class="income-projection" aria-live="polite">
          <div><span>Monthly</span><strong>{{ monthlyEquivalent }} / month</strong></div>
          <div><span>Annual</span><strong>{{ annualEquivalent }} / year</strong></div>
        </div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      </form>
      <DrawerFooter class="income-drawer-footer">
        <Button type="submit" form="income-entry-form" class="w-full">Save Changes</Button>
        <DrawerClose as-child>
          <Button type="button" variant="ghost" class="w-full">Cancel</Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>
