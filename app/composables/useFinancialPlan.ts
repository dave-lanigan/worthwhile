import { emptyPlan, examplePlan, type FinancialPlan, type PlanProfile, type SavedPlan, type SavedPlanProfile } from '#shared/schemas/financial-plan'
import { projectNetWorth } from '#shared/utils/projection'

export async function useFinancialPlan(guest = false, showExample = false) {
  const initialRequest = useFetch<SavedPlan>('/api/plan', { key: guest ? 'guest-plan' : 'saved-plan', immediate: !guest, watch: false })
  const { data, error: loadError, refresh, status } = initialRequest
  const draft = ref<FinancialPlan>(showExample ? examplePlan() : emptyPlan())
  const revision = ref(0)
  const activeProfile = ref<PlanProfile>()
  const profiles = ref<PlanProfile[]>([])
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

  async function refreshProfiles() {
    if (guest) return
    profiles.value = await $fetch<PlanProfile[]>('/api/plan-profiles', { retry: 0 })
  }

  async function selectProfile(id?: string) {
    cancelScheduledSave()
    if (!id) {
      activeProfile.value = undefined
      await reload()
      return
    }
    const saved = await $fetch<SavedPlanProfile>(`/api/plan-profiles/${id}`, { retry: 0 })
    activeProfile.value = { id: saved.id, name: saved.name, description: saved.description }
    draft.value = structuredClone(saved.plan)
    revision.value = saved.revision
    savedJson.value = JSON.stringify(saved.plan)
    saveError.value = ''
    conflict.value = false
  }

  async function createProfile(name: string, description: string, plan: FinancialPlan = draft.value) {
    if (guest || disposed || saving.value || loadError.value || !forecast.value.result) throw new Error('Profile creation is unavailable.')
    const snapshot = structuredClone(toRaw(plan))
    if (dirty.value) await save()
    if (dirty.value || disposed) throw new Error('Save the current plan before creating a profile.')
    cancelScheduledSave()
    saving.value = true
    try {
      const saved = await $fetch<SavedPlanProfile>('/api/plan-profiles', { method: 'POST', body: { name, description, plan: snapshot }, retry: 0 })
      if (disposed) return
      profiles.value.unshift({ id: saved.id, name: saved.name, description: saved.description })
      activeProfile.value = { id: saved.id, name: saved.name, description: saved.description }
      draft.value = structuredClone(saved.plan)
      revision.value = saved.revision
      savedJson.value = JSON.stringify(saved.plan)
      saveError.value = ''
      conflict.value = false
    } finally {
      saving.value = false
      scheduleSave()
    }
  }

  async function deleteProfile(id: string) {
    if (guest) return
    await $fetch(`/api/plan-profiles/${id}`, { method: 'DELETE', retry: 0 })
    profiles.value = profiles.value.filter(profile => profile.id !== id)
    if (activeProfile.value?.id === id) await selectProfile()
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
      const saved = activeProfile.value
        ? await $fetch<SavedPlanProfile>(`/api/plan-profiles/${activeProfile.value.id}`, { method: 'PUT', body: { plan, revision: revision.value }, signal: controller.signal, retry: 0 })
        : await $fetch<SavedPlan>('/api/plan', { method: 'PUT', body: { plan, revision: revision.value }, signal: controller.signal, retry: 0 })
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

  async function clear() {
    cancelScheduledSave()
    if (guest || disposed || saving.value || loadError.value) return false
    saving.value = true
    saveError.value = ''
    controller = new AbortController()
    try {
      const saved = activeProfile.value
        ? await $fetch<SavedPlanProfile>(`/api/plan-profiles/${activeProfile.value.id}`, { method: 'PUT', body: { plan: emptyPlan(), revision: revision.value }, signal: controller.signal, retry: 0 })
        : await $fetch<SavedPlan>('/api/plan', { method: 'PUT', body: { plan: emptyPlan(), revision: revision.value }, signal: controller.signal, retry: 0 })
      if (disposed) return false
      draft.value = saved.plan
      revision.value = saved.revision
      savedJson.value = JSON.stringify(saved.plan)
      return true
    } catch (error: unknown) {
      if (disposed) return false
      conflict.value = (error as { statusCode?: number }).statusCode === 409
      saveError.value = conflict.value ? 'Another tab updated this plan. Reload the saved version to continue.' : 'Your plan could not be cleared. Try again.'
      return false
    } finally {
      saving.value = false
      controller = undefined
    }
  }

  async function reload() {
    if (guest || disposed || saving.value) return
    cancelScheduledSave()
    if (activeProfile.value) await selectProfile(activeProfile.value.id)
    else {
      await refresh()
      acceptLoaded()
    }
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
  if (!guest) {
    try { await refreshProfiles() } catch { /* Profile controls remain unavailable until the next refresh. */ }
  }

  return { draft, dirty, saving, saveError, conflict, loadError, status, forecast, activeProfile, profiles, selectProfile, createProfile, deleteProfile, save, clear, reload }
}