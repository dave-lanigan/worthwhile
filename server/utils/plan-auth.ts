import { createError, type H3Event } from 'h3'

export function requirePlanOwner(event: H3Event, ownerUserId: string) {
  const auth = event.context.auth?.()
  if (!auth?.isAuthenticated || !auth.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in to access your plan.' })
  }
  if (!ownerUserId) {
    throw createError({ statusCode: 503, statusMessage: 'The plan owner has not been configured.' })
  }
  if (auth.userId !== ownerUserId) {
    throw createError({ statusCode: 403, statusMessage: 'This account does not have access to this plan.' })
  }
  return auth.userId
}