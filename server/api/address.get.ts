import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { requireSignedInUser } from '../utils/plan-auth'

type CensusResponse = {
  result?: {
    addressMatches?: Array<{ matchedAddress?: unknown }>
  }
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  requireSignedInUser(event)

  const query = getQuery(event).q
  if (typeof query !== 'string') throw createError({ statusCode: 400, statusMessage: 'Enter an address to search.' })
  const address = query.trim()
  if (address.length < 3) return { suggestions: [] }

  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress')
  url.search = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' }).toString()
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) throw new Error(`Census address lookup returned ${response.status}`)
    const body = await response.json() as CensusResponse
    const suggestions = (body.result?.addressMatches ?? [])
      .map(match => match.matchedAddress)
      .filter((matchedAddress): matchedAddress is string => typeof matchedAddress === 'string' && matchedAddress.length > 0)
      .slice(0, 5)
      .map(address => ({ address }))
    return { suggestions }
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Address lookup is temporarily unavailable.' })
  }
})