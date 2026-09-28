export function localRequestError(host: string | undefined, origin: string | undefined, method: string, contentType: string | undefined, hosted = false): string | null {
  if (!host || (!hosted && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))) return 'This app is available on localhost only.'
  if (origin && origin !== `https://${host}` && (hosted || origin !== `http://${host}`)) return 'Cross-origin requests are not allowed.'
  if (method === 'PUT' && contentType?.split(';')[0]?.trim() !== 'application/json') return 'JSON content is required.'
  return null
}