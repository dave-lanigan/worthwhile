import { emptyUserProfile, exampleUserProfile, type SavedUserProfile, type UserProfile } from '#shared/schemas/financial-plan'

export async function useUserProfile(guest = false) {
  const initialRequest = useFetch<SavedUserProfile>('/api/profile', { key: guest ? 'guest-profile' : 'user-profile', immediate: !guest, watch: false })
  const { data, error: loadError, refresh, status } = initialRequest
  const profile = ref<UserProfile>(guest ? exampleUserProfile() : emptyUserProfile())
  const revision = ref(0)
  const saving = ref(false)
  const saveError = ref('')

  function acceptLoaded() {
    if (!data.value || loadError.value) return
    profile.value = structuredClone(toRaw(data.value.profile))
    revision.value = data.value.revision
    saveError.value = ''
  }

  async function save(nextProfile: UserProfile) {
    if (guest) return false
    saving.value = true
    saveError.value = ''
    try {
      const saved = await $fetch<SavedUserProfile>('/api/profile', { method: 'PUT', body: { profile: nextProfile, revision: revision.value }, retry: 0 })
      profile.value = saved.profile
      revision.value = saved.revision
      return true
    } catch (error: unknown) {
      saveError.value = (error as { statusCode?: number }).statusCode === 409 ? 'Your profile changed in another tab. Reload and try again.' : 'Your profile could not be saved. Try again.'
      return false
    } finally {
      saving.value = false
    }
  }

  async function reload() {
    await refresh()
    acceptLoaded()
  }

  await initialRequest
  acceptLoaded()
  return { profile, saving, saveError, loadError, status, save, reload }
}
