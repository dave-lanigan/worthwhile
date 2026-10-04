import { z } from 'zod'

const vinSchema = z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'Enter a valid 17-character VIN.')
const mileageSchema = z.number().nonnegative().max(10_000_000)
const zipSchema = z.string().trim().regex(/^\d{5}$/, 'Enter a five-digit ZIP code.')
const descriptionSchema = z.string().trim().min(1).max(100)
const yearSchema = z.number().int().min(1).max(9999)

export const vehicleSchema = z.object({
  vin: vinSchema.optional(),
  year: yearSchema.optional(),
  make: descriptionSchema.optional(),
  model: descriptionSchema.optional(),
  trim: descriptionSchema.optional(),
  mileage: mileageSchema.optional(),
  zip: zipSchema.optional(),
})

export const propertyDetailsSchema = z.object({
  address: z.string().trim().min(1).max(300).optional(),
  bedrooms: z.number().nonnegative().max(100).optional(),
  bathrooms: z.number().nonnegative().max(100).optional(),
  squareFootage: z.number().nonnegative().max(10_000_000).optional(),
  yearBuilt: yearSchema.optional(),
})

export const assetValuationSchema = z.object({
  source: z.enum(['MarketCheck', 'RentCast']),
  fetchedAt: z.string().datetime(),
  value: z.number().int().nonnegative().max(100_000_000_000_000),
})

export const valuationRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('car'), vin: vinSchema, mileage: mileageSchema.optional(), zip: zipSchema.optional() }),
  z.object({ type: z.literal('property'), address: z.string().trim().min(3).max(300) }),
])

export type ValuationRequest = z.infer<typeof valuationRequestSchema>
export type ValuationResult = {
  value?: number
  source?: z.infer<typeof assetValuationSchema>['source']
  fetchedAt?: string
  vehicle?: z.infer<typeof vehicleSchema>
  propertyDetails?: z.infer<typeof propertyDetailsSchema>
  notice?: string
}
