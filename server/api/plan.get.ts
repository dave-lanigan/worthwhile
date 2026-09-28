import { createError, defineEventHandler, setHeader } from 'h3'
import { getPlanRepository } from '../utils/database'
import { requirePlanOwner } from '../utils/plan-auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  requirePlanOwner(event, useRuntimeConfig(event).ownerUserId)
  try {
    return await (await getPlanRepository()).read()
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Unable to read the saved plan. Your database has not been changed.' })
  }
})