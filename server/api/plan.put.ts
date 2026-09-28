import { createError, defineEventHandler, readBody, setHeader } from 'h3'
import { savePlanSchema } from '../../shared/schemas/financial-plan'
import { projectNetWorth } from '../../shared/utils/projection'
import { getPlanRepository } from '../utils/database'
import { RevisionConflict } from '../utils/plan-repository'
import { requireSignedInUser } from '../utils/plan-auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const userId = requireSignedInUser(event)
  const parsed = savePlanSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Check the financial values.', data: parsed.error.flatten() })
  try {
    projectNetWorth(parsed.data.plan)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Forecast exceeds the supported amount. Reduce balances, return rates, or horizon.' })
  }
  try {
    return await (await getPlanRepository()).write(userId, parsed.data)
  } catch (error) {
    if (error instanceof RevisionConflict) throw createError({ statusCode: 409, statusMessage: 'Another tab saved changes. Reload the saved plan before saving again.' })
    throw createError({ statusCode: 500, statusMessage: 'Unable to save. Your changes remain in this tab.' })
  }
})