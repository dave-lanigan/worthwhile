import { $fetch } from 'ofetch'
import type { z } from 'zod'
import { propertyDetailsSchema, vehicleSchema, type ValuationRequest, type ValuationResult } from '../../shared/schemas/valuation'

export const valuationUnavailableNotice = "Couldn't reach the valuation service — enter the value manually"
const fetchOptions = { retry: 0, timeout: 5_000 } as const

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function cents(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  const result = Math.round(value * 100)
  return Number.isSafeInteger(result) && result > 0 && result <= 100_000_000_000_000 ? result : undefined
}

function validFields(values: Record<string, unknown>, shape: Record<string, z.ZodType>) {
  return Object.fromEntries(Object.entries(values).flatMap(([key, value]) => {
    const field = shape[key]
    const result = field?.safeParse(value)
    return result?.success && result.data !== undefined ? [[key, result.data]] : []
  }))
}

async function valueCar(request: Extract<ValuationRequest, { type: 'car' }>): Promise<ValuationResult> {
  const vehicle: NonNullable<ValuationResult['vehicle']> = { vin: request.vin, mileage: request.mileage, zip: request.zip }
  try {
    const decoded = object(await $fetch<unknown>(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${request.vin}`, {
      ...fetchOptions,
      query: { format: 'json' },
    }))
    const details = new Map((Array.isArray(decoded.Results) ? decoded.Results : []).map((row: unknown) => {
      const item = object(row)
      return [text(item.Variable), text(item.Value)]
    }))
    const modelYear = details.get('Model Year')
    Object.assign(vehicle, validFields({
      year: modelYear && /^\d{4}$/.test(modelYear) ? Number(modelYear) : undefined,
      make: details.get('Make'),
      model: details.get('Model'),
      trim: details.get('Trim'),
    }, vehicleSchema.shape))
  } catch {
    // A partial or unavailable VIN decode must not prevent a price lookup.
  }

  const fallback: ValuationResult = { vehicle, notice: valuationUnavailableNotice }
  const apiKey = process.env.MARKETCHECK_API_KEY
  if (!apiKey) return fallback
  try {
    const result = object(await $fetch<unknown>('https://api.marketcheck.com/v2/predict/car/us/marketcheck_price/comparables', {
      ...fetchOptions,
      // This is independent-dealer retail pricing, not a private-party or trade-in estimate.
      query: { api_key: apiKey, vin: request.vin, miles: request.mileage ?? 50_000, zip: request.zip ?? '50501', dealer_type: 'independent' },
    }))
    if (result.success === false || result.error) return fallback
    const prediction = result.data === undefined ? result : object(result.data)
    const value = cents(prediction.marketcheck_price) ?? cents(prediction.predicted_price)
    return value === undefined ? fallback : { vehicle, value, source: 'MarketCheck', fetchedAt: new Date().toISOString() }
  } catch {
    return fallback
  }
}

async function valueProperty(request: Extract<ValuationRequest, { type: 'property' }>): Promise<ValuationResult> {
  let propertyDetails: NonNullable<ValuationResult['propertyDetails']> = { address: request.address }
  const apiKey = process.env.RENTCAST_API_KEY
  if (!apiKey) return { propertyDetails, notice: valuationUnavailableNotice }
  try {
    const result = object(await $fetch<unknown>('https://api.rentcast.io/v1/avm/value', {
      ...fetchOptions,
      headers: { 'X-Api-Key': apiKey },
      query: { address: request.address, lookupSubjectAttributes: true },
    }))
    const subject = object(result.subjectProperty)
    propertyDetails = {
      ...propertyDetails,
      ...validFields({
        address: text(subject.formattedAddress),
        bedrooms: subject.bedrooms,
        bathrooms: subject.bathrooms,
        squareFootage: subject.squareFootage,
        yearBuilt: subject.yearBuilt,
      }, propertyDetailsSchema.shape),
    }
    const value = cents(result.price)
    return value === undefined
      ? { propertyDetails, notice: valuationUnavailableNotice }
      : { propertyDetails, value, source: 'RentCast', fetchedAt: new Date().toISOString() }
  } catch {
    return { propertyDetails, notice: valuationUnavailableNotice }
  }
}

export async function lookupAssetValuation(request: ValuationRequest): Promise<ValuationResult> {
  return request.type === 'car' ? valueCar(request) : valueProperty(request)
}
