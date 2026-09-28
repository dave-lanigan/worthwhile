import { createError, defineEventHandler, getRouterParam, readBody, setHeader } from 'h3'
import { savePlanProfileSchema } from '../../../shared/schemas/financial-plan'
import { getPlanRepository } from '../../utils/database'
import { RevisionConflict } from '../../utils/plan-repository'
import { requireSignedInUser } from '../../utils/plan-auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Profile ID is required.' })
  const parsed = savePlanProfileSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Check the financial values.' })
  try {
    return await (await getPlanRepository()).writeProfilePlan(requireSignedInUser(event), id, parsed.data)
  } catch (error) {
    if (error instanceof RevisionConflict) throw createError({ statusCode: 409, statusMessage: 'This profile changed in another tab.' })
    throw createError({ statusCode: 500, statusMessage: 'Unable to save profile.' })
  }
})
