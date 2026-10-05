import { createError, defineEventHandler, readBody, setHeader } from 'h3'
import { valuationRequestSchema } from '../../shared/schemas/valuation'
import { lookupAssetValuation } from '../utils/asset-valuation'
import { requireSignedInUser } from '../utils/plan-auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  requireSignedInUser(event)
  const request = valuationRequestSchema.safeParse(await readBody(event))
  if (!request.success) {
    throw createError({ statusCode: 400, statusMessage: 'Enter valid vehicle or property details.' })
  }
  return lookupAssetValuation(request.data)
})
