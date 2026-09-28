import { createError, defineEventHandler, setHeader } from 'h3'
import { getPlanRepository } from '../../utils/database'
import { requireSignedInUser } from '../../utils/plan-auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  try {
    return await (await getPlanRepository()).listProfiles(requireSignedInUser(event))
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Unable to load profiles.' })
  }
})
