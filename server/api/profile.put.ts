import { createError, defineEventHandler, readBody, setHeader } from 'h3'
import { savedUserProfileSchema } from '../../shared/schemas/financial-plan'
import { getPlanRepository } from '../utils/database'
import { RevisionConflict } from '../utils/plan-repository'
import { requireSignedInUser } from '../utils/plan-auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const userId = requireSignedInUser(event)
  const parsed = savedUserProfileSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Check your profile details.', data: parsed.error.flatten() })
  try {
    return await (await getPlanRepository()).writeProfile(userId, parsed.data)
  } catch (error) {
    if (error instanceof RevisionConflict) throw createError({ statusCode: 409, statusMessage: 'Another tab saved profile changes. Reload and try again.' })
    throw createError({ statusCode: 500, statusMessage: 'Unable to save your profile. Your changes remain in this tab.' })
  }
})
