import { createError, defineEventHandler, getHeader } from 'h3'
import { localRequestError } from '../utils/local-request'

export default defineEventHandler((event) => {
  const error = localRequestError(getHeader(event, 'host'), getHeader(event, 'origin'), event.method, getHeader(event, 'content-type'), process.env.VERCEL === '1')
  if (error) throw createError({ statusCode: 403, statusMessage: error })
})