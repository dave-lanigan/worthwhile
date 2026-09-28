import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, toRaw, watch } from 'vue'
import { useFinancialPlan } from '../app/composables/useFinancialPlan'
import { emptyPlan, type SavedPlan } from '../shared/schemas/financial-plan'

let mount: () => void
let dispose: () => void
let saved: ReturnType<typeof ref<SavedPlan>>
let loadError: ReturnType<typeof ref<Error | undefined>>
const put = vi.fn()
const refresh = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  mount = () => {}
  dispose = () => {}
  saved = ref({ plan: emptyPlan(), revision: 3 })
  loadError = ref()
  put.mockReset().mockImplementation(async (_url, options) => ({ plan: options.body.plan, revision: options.body.revision + 1 }))
  refresh.mockReset()
  for (const [name, value] of Object.entries({ ref, computed, toRaw, watch })) vi.stubGlobal(name, value)
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('onMounted', (callback: () => void) => { mount = callback })
  vi.stubGlobal('onBeforeUnmount', (callback: () => void) => { dispose = callback })
  vi.stubGlobal('$fetch', (url: string, options?: { method?: string }) => url === '/api/plan-profiles' && !options?.method ? Promise.resolve([]) : put(url, options))
  vi.stubGlobal('useFetch', () => {
    const result = { data: saved, error: loadError, refresh, status: ref('success') }
    return Object.assign(Promise.resolve(result), result)
  })
})

afterEach(() => {
  dispose()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('does not write on load and debounces edits into one automatic save', async () => {
  const state = await useFinancialPlan()
  mount()
  await vi.advanceTimersByTimeAsync(1000)
  expect(put).not.toHaveBeenCalled()
  state.draft.value.startingCash = 100
  await nextTick()
  await vi.advanceTimersByTimeAsync(400)
  state.draft.value.startingCash = 200
  await nextTick()
  await vi.advanceTimersByTimeAsync(599)
  expect(put).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(put).toHaveBeenCalledTimes(1)
  expect(put.mock.calls[0]![1].body).toEqual({ plan: { ...emptyPlan(), startingCash: 200 }, revision: 3 })
  expect(state.dirty.value).toBe(false)
})

it.each([false, true])('creates a profile with blank=%s without overwriting the original', async (blank) => {
  const state = await useFinancialPlan()
  mount()
  state.draft.value.startingCash = 100
  await nextTick()
  put.mockImplementation(async (_url, options) => options.method === 'POST'
    ? { id: 'new-profile', name: 'New profile', description: '', plan: options.body.plan, revision: 1 }
    : { plan: options.body.plan, revision: options.body.revision + 1 })
  await state.createProfile('New profile', '', blank ? emptyPlan() : undefined)
  await nextTick()
  await vi.advanceTimersByTimeAsync(1000)
  expect(put).toHaveBeenCalledTimes(2)
  expect(put.mock.calls[0]![0]).toBe('/api/plan')
  expect(put.mock.calls[0]![1].body.plan.startingCash).toBe(100)
  expect(put.mock.calls[1]![1].body.plan.startingCash).toBe(blank ? 0 : 100)
  expect(state.draft.value.startingCash).toBe(blank ? 0 : 100)
  expect(state.activeProfile.value?.id).toBe('new-profile')
  expect(state.dirty.value).toBe(false)
})

it('keeps the current draft when creating a profile fails', async () => {
  saved.value.plan.startingCash = 100
  const state = await useFinancialPlan()
  mount()
  put.mockRejectedValueOnce(new Error('Unavailable'))
  await expect(state.createProfile('New profile', '', emptyPlan())).rejects.toThrow('Unavailable')
  expect(state.draft.value.startingCash).toBe(100)
  expect(state.activeProfile.value).toBeUndefined()
  expect(state.saving.value).toBe(false)
})

it.each([0, 200])('queues edits to %s during a save using the acknowledged revision', async (amount) => {
  let finish!: (value: SavedPlan) => void
  put.mockImplementationOnce(() => new Promise<SavedPlan>(resolve => { finish = resolve }))
  const state = await useFinancialPlan()
  mount()
  state.draft.value.startingCash = 100
  await nextTick()
  await vi.advanceTimersByTimeAsync(600)
  state.draft.value.startingCash = amount
  await nextTick()
  await vi.advanceTimersByTimeAsync(1000)
  expect(put).toHaveBeenCalledTimes(1)
  finish({ plan: { ...emptyPlan(), startingCash: 100 }, revision: 4 })
  await vi.advanceTimersByTimeAsync(600)
  expect(put).toHaveBeenCalledTimes(2)
  expect(put.mock.calls[1]![1].body.revision).toBe(4)
  expect(put.mock.calls[1]![1].body.plan.startingCash).toBe(amount)
  expect(state.dirty.value).toBe(false)
})

it('keeps failed changes, supports retry, and never overwrites a conflict', async () => {
  put.mockRejectedValueOnce({ statusCode: 503 })
  const state = await useFinancialPlan()
  mount()
  state.draft.value.startingCash = 100
  await nextTick()
  await vi.advanceTimersByTimeAsync(2000)
  expect(put).toHaveBeenCalledTimes(1)
  expect(state.saveError.value).toContain('could not be saved')
  expect(state.dirty.value).toBe(true)
  await state.save()
  expect(state.saveError.value).toBe('')
  expect(state.dirty.value).toBe(false)
  put.mockRejectedValueOnce({ statusCode: 409 })
  state.draft.value.startingCash = 200
  await nextTick()
  await vi.advanceTimersByTimeAsync(600)
  expect(state.conflict.value).toBe(true)
  state.draft.value.startingCash = 300
  await nextTick()
  await vi.advanceTimersByTimeAsync(1000)
  expect(put).toHaveBeenCalledTimes(3)
  refresh.mockImplementationOnce(async () => { saved.value = { plan: emptyPlan(), revision: 8 } })
  await state.reload()
  await nextTick()
  await vi.advanceTimersByTimeAsync(600)
  expect(state.conflict.value).toBe(false)
  expect(state.dirty.value).toBe(false)
  expect(put).toHaveBeenCalledTimes(3)
})

it('does not save guest edits or invalid forecasts', async () => {
  const guest = await useFinancialPlan(true)
  mount()
  guest.draft.value.startingCash = 100
  await guest.save()
  await guest.reload()
  await nextTick()
  await vi.advanceTimersByTimeAsync(1000)
  expect(put).not.toHaveBeenCalled()
  expect(refresh).not.toHaveBeenCalled()
  dispose()
  const state = await useFinancialPlan()
  mount()
  state.draft.value.years = 0
  await nextTick()
  await vi.advanceTimersByTimeAsync(1000)
  expect(put).not.toHaveBeenCalled()
  state.draft.value.years = 2
  await nextTick()
  await vi.advanceTimersByTimeAsync(600)
  expect(put).toHaveBeenCalledTimes(1)
})

it('aborts an active save and discards queued edits when leaving the page', async () => {
  let finish!: (value: SavedPlan) => void
  put.mockImplementationOnce(() => new Promise<SavedPlan>(resolve => { finish = resolve }))
  const state = await useFinancialPlan()
  mount()
  state.draft.value.startingCash = 100
  await nextTick()
  await vi.advanceTimersByTimeAsync(600)
  state.draft.value.startingCash = 200
  await nextTick()
  dispose()
  expect(put.mock.calls[0]![1].signal.aborted).toBe(true)
  finish({ plan: { ...emptyPlan(), startingCash: 100 }, revision: 4 })
  await vi.advanceTimersByTimeAsync(1000)
  expect(put).toHaveBeenCalledTimes(1)
})

it('does not write after a load error or after leaving the page', async () => {
  loadError.value = new Error('Load failed')
  const failed = await useFinancialPlan()
  mount()
  failed.draft.value.startingCash = 100
  await nextTick()
  await vi.advanceTimersByTimeAsync(1000)
  expect(put).not.toHaveBeenCalled()
  dispose()
  loadError.value = undefined
  const state = await useFinancialPlan()
  mount()
  state.draft.value.startingCash = 100
  await nextTick()
  dispose()
  await vi.advanceTimersByTimeAsync(1000)
  expect(put).not.toHaveBeenCalled()
})