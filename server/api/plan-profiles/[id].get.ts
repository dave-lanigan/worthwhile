import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import { getPlanRepository } from '../../utils/database'
import { requireSignedInUser } from '../../utils/plan-auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Profile ID is required.' })
  try {
    return await (await getPlanRepository()).readProfilePlan(requireSignedInUser(event), id)
  } catch (error) {
    if (error instanceof Error && error.message === 'Profile not found.') throw createError({ statusCode: 404, statusMessage: error.message })
    throw createError({ statusCode: 500, statusMessage: 'Unable to load profile.' })
  }
})
