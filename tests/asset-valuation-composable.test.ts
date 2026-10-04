import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useAssetValuation } from '../app/composables/useAssetValuation'
import type { ValuationResult } from '../shared/schemas/valuation'

const fetch = vi.fn()
const car = { type: 'car' as const, vin: '1HGCM82633A004352', mileage: 50000, zip: '78701' }
let dispose: () => void

beforeEach(() => {
  fetch.mockReset()
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('$fetch', fetch)
  vi.stubGlobal('onBeforeUnmount', (callback: () => void) => { dispose = callback })
})

afterEach(() => {
  dispose()
  vi.unstubAllGlobals()
})

it('does not fetch until explicitly requested and disables retries', async () => {
  const state = useAssetValuation()
  expect(fetch).not.toHaveBeenCalled()
  fetch.mockResolvedValue({ value: 1500000, source: 'MarketCheck', fetchedAt: '2026-10-01T00:00:00.000Z' })
  await state.lookup(car)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith('/api/valuation', expect.objectContaining({ method: 'POST', retry: 0, body: car, timeout: 25000 }))
  await state.lookup(car)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('rejects invalid VINs locally with zero requests', async () => {
  const state = useAssetValuation()
  await state.lookup({ ...car, vin: 'SHORT' })
  expect(fetch).not.toHaveBeenCalled()
  expect(state.notice.value).not.toBe('')
  expect(state.loading.value).toBe(false)
})

it('prevents overlapping lookups and ignores results after cancellation', async () => {
  let finish!: (result: ValuationResult) => void
  fetch.mockImplementation(() => new Promise<ValuationResult>(resolve => { finish = resolve }))
  const state = useAssetValuation()
  const pending = state.lookup(car)
  expect(state.loading.value).toBe(true)
  await state.lookup(car)
  expect(fetch).toHaveBeenCalledTimes(1)
  const signal = fetch.mock.calls[0]![1].signal as AbortSignal
  state.cancel()
  expect(signal.aborted).toBe(true)
  finish({ value: 10000 })
  expect(await pending).toBeUndefined()
  expect(state.loading.value).toBe(false)
})

it('turns network failures into a manual-safe notice without exposing errors', async () => {
  fetch.mockRejectedValue(new Error('private upstream request'))
  const state = useAssetValuation()
  await expect(state.lookup(car)).resolves.toBeUndefined()
  expect(state.notice.value).toBe("Couldn't reach the valuation service — enter the value manually")
  expect(state.loading.value).toBe(false)
})

it('retains decoded details when the price provider is unavailable', async () => {
  const result = { vehicle: { year: 2020, make: 'Honda', model: 'Civic' }, notice: "Couldn't reach the valuation service — enter the value manually" }
  fetch.mockResolvedValue(result)
  const state = useAssetValuation()
  expect(await state.lookup(car)).toEqual(result)
  expect(state.notice.value).toBe(result.notice)
})
