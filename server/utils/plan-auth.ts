import { createError, type H3Event } from 'h3'

export function requireSignedInUser(event: H3Event) {
  const auth = event.context.auth?.()
  if (!auth?.isAuthenticated || !auth.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in to access your plan.' })
  }
  return auth.userId
}