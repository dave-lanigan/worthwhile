import { createServer } from 'node:http'
import { createApp, defineEventHandler, getHeader, toNodeListener, type H3Event } from 'h3'
import { $fetch } from 'ofetch'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import postValuation from '../server/api/valuation.post'
import { lookupAssetValuation, valuationUnavailableNotice } from '../server/utils/asset-valuation'
import { realEstateSchema } from '../shared/schemas/financial-plan'
import { valuationRequestSchema } from '../shared/schemas/valuation'

vi.mock('ofetch', () => ({ $fetch: vi.fn() }))

const car = { type: 'car', vin: '1HGCM82633A004352', mileage: 45_000, zip: '90210' } as const
const property = { type: 'property', address: '123 Main St, Austin, TX 78701' } as const
const decoded = { Results: [{ ModelYear: '2003', Make: 'HONDA', Model: 'Accord', Trim: 'EX' }] }

beforeEach(() => {
  vi.mocked($fetch).mockReset()
  vi.stubEnv('MARKETCHECK_API_KEY', 'test-marketcheck-key')
  vi.stubEnv('RENTCAST_API_KEY', 'test-rentcast-key')
})
afterEach(() => vi.unstubAllEnvs())

describe('valuation schemas', () => {
  it('normalizes valid VINs and requires mileage and ZIP', () => {
    expect(valuationRequestSchema.parse({ ...car, vin: ` ${car.vin.toLowerCase()} ` })).toMatchObject({ vin: car.vin })
    expect(valuationRequestSchema.safeParse({ type: 'car', vin: car.vin, zip: car.zip }).success).toBe(false)
    expect(valuationRequestSchema.safeParse({ ...car, mileage: -1 }).success).toBe(false)
    expect(valuationRequestSchema.safeParse({ ...car, zip: '9021' }).success).toBe(false)
    expect(valuationRequestSchema.safeParse({ ...car, zip: undefined }).success).toBe(false)
    expect(valuationRequestSchema.safeParse({ ...property, address: '  ' }).success).toBe(false)
  })

  it.each(['short', '1HGCM82633A00435I', '1HGCM82633A00435O', '1HGCM82633A00435Q', '1HGCM82633A00435!'])('rejects invalid VIN %s', vin => {
    expect(valuationRequestSchema.safeParse({ ...car, vin }).success).toBe(false)
  })

  it('does not add fields to existing assets and validates optional provenance', () => {
    const legacy = { id: 'house', name: 'House', value: 50_000_000, annualAppreciation: 3 }
    expect(realEstateSchema.parse(legacy)).toEqual(legacy)
    expect(realEstateSchema.safeParse({ ...legacy, assetType: 'boat' }).success).toBe(false)
    expect(realEstateSchema.safeParse({ ...legacy, valuation: { source: 'RentCast', value: 1.5, fetchedAt: 'not-a-date' } }).success).toBe(false)
  })
})

describe('provider valuation lookup', () => {
  it('decodes a car first, then makes one correctly parameterized price request in cents', async () => {
    vi.mocked($fetch).mockResolvedValueOnce(decoded).mockResolvedValueOnce({ marketcheck_price: 12_345.67 })
    const result = await lookupAssetValuation(car)
    expect(result).toEqual({
      value: 1_234_567, source: 'MarketCheck', fetchedAt: expect.any(String),
      vehicle: { vin: car.vin, mileage: car.mileage, zip: car.zip, year: 2003, make: 'HONDA', model: 'Accord', trim: 'EX' },
    })
    expect(new Date(result.fetchedAt!).toISOString()).toBe(result.fetchedAt)
    expect($fetch).toHaveBeenCalledTimes(2)
    expect($fetch).toHaveBeenNthCalledWith(1, `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${car.vin}`, {
      query: { format: 'json' }, retry: 0, timeout: 5_000,
    })
    expect($fetch).toHaveBeenNthCalledWith(2, 'https://api.marketcheck.com/v2/predict/car/us/marketcheck', {
      query: { api_key: 'test-marketcheck-key', vin: car.vin, mileage: car.mileage, zip: car.zip, dealer_type: 'independent' },
      retry: 0, timeout: 5_000,
    })
  })

  it('returns decoded details without a configured price key', async () => {
    vi.stubEnv('MARKETCHECK_API_KEY', '')
    vi.mocked($fetch).mockResolvedValue(decoded)
    expect(await lookupAssetValuation(car)).toMatchObject({
      vehicle: { year: 2003, make: 'HONDA', model: 'Accord' }, notice: valuationUnavailableNotice,
    })
    expect($fetch).toHaveBeenCalledTimes(1)
  })

  it('tolerates partial, invalid, and unavailable VIN decodes', async () => {
    vi.mocked($fetch).mockResolvedValueOnce({ Results: [{ ErrorCode: '1,6', ModelYear: 'invalid', Make: 'HONDA', Model: '', Trim: null }] })
      .mockResolvedValueOnce({ marketcheck_price: 5000 })
    expect(await lookupAssetValuation(car)).toMatchObject({
      value: 500_000, vehicle: { vin: car.vin, make: 'HONDA', mileage: car.mileage, zip: car.zip },
    })
    vi.mocked($fetch).mockRejectedValueOnce(new Error('VIN decode timeout')).mockResolvedValueOnce({ marketcheck_price: 6000 })
    expect(await lookupAssetValuation(car)).toMatchObject({ value: 600_000, vehicle: { vin: car.vin } })
    expect($fetch).toHaveBeenCalledTimes(4)
  })

  it('gets a property price and subject attributes with only one authenticated request', async () => {
    vi.mocked($fetch).mockResolvedValue({
      price: 450_000.25,
      subjectProperty: { formattedAddress: property.address, bedrooms: 3, bathrooms: 2.5, squareFootage: 1900, yearBuilt: 1985, owner: 'Do not return' },
    })
    expect(await lookupAssetValuation(property)).toEqual({
      value: 45_000_025, source: 'RentCast', fetchedAt: expect.any(String),
      propertyDetails: { address: property.address, bedrooms: 3, bathrooms: 2.5, squareFootage: 1900, yearBuilt: 1985 },
    })
    expect($fetch).toHaveBeenCalledTimes(1)
    expect($fetch).toHaveBeenCalledWith('https://api.rentcast.io/v1/avm/value', {
      query: { address: property.address, lookupSubjectAttributes: true },
      headers: { 'X-Api-Key': 'test-rentcast-key' }, retry: 0, timeout: 5_000,
    })
  })

  it('returns a manual-entry notice without a configured property key', async () => {
    vi.stubEnv('RENTCAST_API_KEY', '')
    expect(await lookupAssetValuation(property)).toEqual({ propertyDetails: { address: property.address }, notice: valuationUnavailableNotice })
    expect($fetch).not.toHaveBeenCalled()
  })

  it.each([undefined, null, '450000', NaN, Infinity, -1, 0, 1e20])('sanitizes invalid prices %s for both providers', async price => {
    vi.mocked($fetch).mockResolvedValueOnce(decoded).mockResolvedValueOnce({ marketcheck_price: price })
    expect(await lookupAssetValuation(car)).toMatchObject({ notice: valuationUnavailableNotice })
    vi.mocked($fetch).mockResolvedValueOnce({
      price, subjectProperty: { bedrooms: -1, bathrooms: Infinity, squareFootage: '1900', yearBuilt: NaN },
    })
    expect(await lookupAssetValuation(property)).toEqual({ propertyDetails: { address: property.address }, notice: valuationUnavailableNotice })
  })

  it.each(['TimeoutError', 'FetchError'])('contains %s without retrying or exposing provider errors or keys', async name => {
    const error = Object.assign(new Error('Provider failed api_key=test-marketcheck-key X-Api-Key=test-rentcast-key'), {
      name, data: { key: 'test-marketcheck-key' },
    })
    vi.mocked($fetch).mockResolvedValueOnce(decoded).mockRejectedValueOnce(error).mockRejectedValueOnce(error)
    const carResult = await lookupAssetValuation(car)
    const propertyResult = await lookupAssetValuation(property)
    expect(carResult).toMatchObject({ notice: valuationUnavailableNotice })
    expect(propertyResult).toEqual({ propertyDetails: { address: property.address }, notice: valuationUnavailableNotice })
    expect(JSON.stringify([carResult, propertyResult])).not.toContain('test-marketcheck-key')
    expect(JSON.stringify([carResult, propertyResult])).not.toContain('test-rentcast-key')
    expect(JSON.stringify([carResult, propertyResult])).not.toContain('Provider failed')
    expect($fetch).toHaveBeenCalledTimes(3)
    for (const [, options] of vi.mocked($fetch).mock.calls) {
      expect(options).toMatchObject({ retry: 0, timeout: 5_000 })
    }
  })
})

it('POST valuation requires a signed-in session, validates before fetch, and never caches responses', async () => {
  const app = createApp().use(defineEventHandler((event) => {
    const userId = getHeader(event, 'x-test-session') ?? null
    event.context.auth = (() => ({ userId, isAuthenticated: !!userId })) as unknown as H3Event['context']['auth']
  })).use('/api/valuation', postValuation)
  const server = createServer(toNodeListener(app))
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP port')
    const url = `http://127.0.0.1:${address.port}/api/valuation`
    const submit = (body: unknown, signedIn = true) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(signedIn ? { 'x-test-session': 'user_first' } : {}) },
      body: JSON.stringify(body),
    })
    const unauthorized = await submit(car, false)
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('cache-control')).toBe('no-store')
    const invalid = await submit({ ...car, vin: 'invalid' })
    expect(invalid.status).toBe(400)
    expect(invalid.headers.get('cache-control')).toBe('no-store')
    expect($fetch).not.toHaveBeenCalled()
    vi.mocked($fetch).mockResolvedValueOnce(decoded).mockResolvedValueOnce({ marketcheck_price: 12_000 })
    const success = await submit(car)
    expect(success.status).toBe(200)
    expect(success.headers.get('cache-control')).toBe('no-store')
    expect(await success.json()).toMatchObject({ value: 1_200_000, source: 'MarketCheck' })
    vi.mocked($fetch).mockRejectedValueOnce(new Error('test-rentcast-key'))
    const unavailable = await submit(property)
    expect(unavailable.status).toBe(200)
    expect(await unavailable.text()).not.toContain('test-rentcast-key')
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
