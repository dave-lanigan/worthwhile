import { emptyPlan, type FinancialPlan, type SavedPlan } from '#shared/schemas/financial-plan'
import { projectNetWorth } from '#shared/utils/projection'

export async function useFinancialPlan(guest = false) {
  const initialRequest = useFetch<SavedPlan>('/api/plan', { key: guest ? 'guest-plan' : 'saved-plan', immediate: !guest, watch: false })
  const { data, error: loadError, refresh, status } = initialRequest
  const draft = ref<FinancialPlan>(emptyPlan())
  const revision = ref(0)
  const savedJson = ref(JSON.stringify(draft.value))
  const saving = ref(false)
  const saveError = ref('')
  const conflict = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopWatching: (() => void) | undefined
  let controller: AbortController | undefined
  let disposed = false

  function cancelScheduledSave() {
    clearTimeout(timer)
    timer = undefined
  }

  function acceptLoaded() {
    if (!guest && data.value && !loadError.value) {
      draft.value = structuredClone(toRaw(data.value.plan))
      revision.value = data.value.revision
      savedJson.value = JSON.stringify(data.value.plan)
      saveError.value = ''
      conflict.value = false
    }
  }
  const dirty = computed(() => JSON.stringify(draft.value) !== savedJson.value)
  const forecast = computed(() => {
    try {
      return { result: projectNetWorth(draft.value), error: '' }
    } catch (error) {
      const message = error instanceof Error && error.message.startsWith('This forecast') ? error.message : 'Check the amounts, return rates, and time horizon.'
      return { result: null, error: message }
    }
  })

  function canSave() {
    return !guest && !disposed && !saving.value && dirty.value && !!forecast.value.result && !loadError.value && status.value !== 'pending' && !conflict.value
  }

  function scheduleSave() {
    cancelScheduledSave()
    if (canSave()) timer = setTimeout(() => { void save() }, 600)
  }

  async function save() {
    cancelScheduledSave()
    if (!canSave()) return
    saving.value = true
    saveError.value = ''
    controller = new AbortController()
    const plan = structuredClone(toRaw(draft.value))
    try {
      const saved = await $fetch<SavedPlan>('/api/plan', { method: 'PUT', body: { plan, revision: revision.value }, signal: controller.signal, retry: 0 })
      if (disposed) return
      revision.value = saved.revision
      savedJson.value = JSON.stringify(saved.plan)
    } catch (error: unknown) {
      if (disposed) return
      const response = error as { statusCode?: number }
      conflict.value = response.statusCode === 409
      saveError.value = conflict.value ? 'Another tab updated this plan. Reload the saved version to continue.' : 'Changes could not be saved. Check your connection and retry.'
    } finally {
      saving.value = false
      controller = undefined
      if (!saveError.value) scheduleSave()
    }
  }

  async function reload() {
    if (guest || disposed || saving.value) return
    cancelScheduledSave()
    await refresh()
    acceptLoaded()
  }

  function warnBeforeLeaving(event: BeforeUnloadEvent) {
    if (dirty.value) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  onMounted(() => {
    window.addEventListener('beforeunload', warnBeforeLeaving)
    if (!guest) stopWatching = watch(draft, scheduleSave, { deep: true })
  })
  onBeforeUnmount(() => {
    disposed = true
    cancelScheduledSave()
    stopWatching?.()
    controller?.abort()
    window.removeEventListener('beforeunload', warnBeforeLeaving)
  })

  await initialRequest
  acceptLoaded()

  return { draft, dirty, saving, saveError, conflict, loadError, status, forecast, save, reload }
}