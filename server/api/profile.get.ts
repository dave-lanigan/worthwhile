import { createError, defineEventHandler, setHeader } from 'h3'
import { getPlanRepository } from '../utils/database'
import { requireSignedInUser } from '../utils/plan-auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const userId = requireSignedInUser(event)
  try {
    return await (await getPlanRepository()).readProfile(userId)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Unable to read your profile. Your database has not been changed.' })
  }
})
