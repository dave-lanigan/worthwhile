import { createError, defineEventHandler, readBody, setHeader } from 'h3'
import { createPlanProfileSchema } from '../../../shared/schemas/financial-plan'
import { getPlanRepository } from '../../utils/database'
import { requireSignedInUser } from '../../utils/plan-auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const userId = requireSignedInUser(event)
  const parsed = createPlanProfileSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Provide a profile name, description, and valid financial plan.' })
  try {
    return await (await getPlanRepository()).createProfile(userId, parsed.data)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Unable to create profile.' })
  }
})
