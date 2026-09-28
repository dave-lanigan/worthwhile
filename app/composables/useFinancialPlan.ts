import { emptyPlan, type FinancialPlan, type SavedPlan } from '#shared/schemas/financial-plan'
import { projectNetWorth } from '#shared/utils/projection'

export async function useFinancialPlan(guest = false) {
  const { data, error: loadError, refresh, status } = await useFetch<SavedPlan>('/api/plan', { key: guest ? 'guest-plan' : 'saved-plan', immediate: !guest, watch: false })
  const draft = ref<FinancialPlan>(emptyPlan())
  const revision = ref(0)
  const savedJson = ref(JSON.stringify(draft.value))
  const saving = ref(false)
  const saveError = ref('')
  const conflict = ref(false)

  function acceptLoaded() {
    if (!guest && data.value && !loadError.value) {
      draft.value = structuredClone(toRaw(data.value.plan))
      revision.value = data.value.revision
      savedJson.value = JSON.stringify(data.value.plan)
      saveError.value = ''
      conflict.value = false
    }
  }
  acceptLoaded()
  const dirty = computed(() => JSON.stringify(draft.value) !== savedJson.value)
  const forecast = computed(() => {
    try {
      return { result: projectNetWorth(draft.value), error: '' }
    } catch (error) {
      const message = error instanceof Error && error.message.startsWith('This forecast') ? error.message : 'Check the amounts, return rates, and time horizon.'
      return { result: null, error: message }
    }
  })

  async function save() {
    if (guest || saving.value || !forecast.value.result || loadError.value || conflict.value) return
    saving.value = true
    saveError.value = ''
    const plan = structuredClone(toRaw(draft.value))
    try {
      const saved = await $fetch<SavedPlan>('/api/plan', { method: 'PUT', body: { plan, revision: revision.value } })
      revision.value = saved.revision
      savedJson.value = JSON.stringify(saved.plan)
    } catch (error: unknown) {
      const response = error as { statusCode?: number }
      conflict.value = response.statusCode === 409
      saveError.value = conflict.value ? 'Another tab saved a newer plan. Reload the saved version before saving again.' : 'Could not save your plan. Your changes are still here; try again.'
    } finally {
      saving.value = false
    }
  }

  async function reload() {
    if (guest) return
    await refresh()
    acceptLoaded()
  }

  function warnBeforeLeaving(event: BeforeUnloadEvent) {
    if (dirty.value) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  onMounted(() => window.addEventListener('beforeunload', warnBeforeLeaving))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeLeaving))

  return { draft, dirty, saving, saveError, conflict, loadError, status, forecast, save, reload }
}