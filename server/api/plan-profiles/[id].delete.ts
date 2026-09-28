import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import { getPlanRepository } from '../../utils/database'
import { requireSignedInUser } from '../../utils/plan-auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Profile ID is required.' })
  try {
    await (await getPlanRepository()).deleteProfile(requireSignedInUser(event), id)
    return { ok: true }
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Unable to delete profile.' })
  }
})
