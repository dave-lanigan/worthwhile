import { valuationRequestSchema, type ValuationRequest, type ValuationResult } from '#shared/schemas/valuation'

export function useAssetValuation() {
  const loading = ref(false)
  const notice = ref('')
  let controller: AbortController | undefined

  function cancel() {
    controller?.abort()
    controller = undefined
    loading.value = false
    notice.value = ''
  }

  async function lookup(request: ValuationRequest): Promise<ValuationResult | undefined> {
    if (loading.value) return
    const parsed = valuationRequestSchema.safeParse(request)
    if (!parsed.success) {
      notice.value = parsed.error.issues.map(issue => issue.path[0] === 'mileage'
        ? 'Enter the current mileage (0 or more).'
        : issue.path[0] === 'address' ? 'Enter a street address, city, state, and ZIP code.' : issue.message).join(' ')
      return
    }
    const current = new AbortController()
    controller = current
    loading.value = true
    notice.value = ''
    try {
      const result = await $fetch<ValuationResult>('/api/valuation', {
        method: 'POST', body: parsed.data, retry: 0, timeout: 25000, signal: current.signal,
      })
      if (controller !== current) return
      notice.value = result.notice ?? ''
      return result
    } catch {
      if (controller === current) notice.value = "Couldn't reach the valuation service — enter the value manually"
    } finally {
      if (controller === current) {
        controller = undefined
        loading.value = false
      }
    }
  }

  onBeforeUnmount(cancel)
  return { loading, notice, lookup, cancel }
}
