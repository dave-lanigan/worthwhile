import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPlanRepository } from '../server/utils/database'
import { localRequestError } from '../server/utils/local-request'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Vercel request guard', () => {
  it.each(['worthwhile.vercel.app', 'worthwhile-preview.vercel.app', 'worthwhile.example.com'])('accepts HTTPS same-origin requests on %s', (host) => {
    expect(localRequestError(host, `https://${host}`, 'PUT', 'application/json', true)).toBeNull()
    expect(localRequestError(host, undefined, 'GET', undefined, true)).toBeNull()
    expect(localRequestError(host, undefined, 'GET', undefined)).toBeTruthy()
  })

  it('rejects foreign origins, insecure origins, missing hosts, and non-JSON writes', () => {
    expect(localRequestError('worthwhile.vercel.app', 'https://attacker.test', 'PUT', 'application/json', true)).toBeTruthy()
    expect(localRequestError('worthwhile.vercel.app', 'http://worthwhile.vercel.app', 'PUT', 'application/json', true)).toBeTruthy()
    expect(localRequestError(undefined, undefined, 'GET', undefined, true)).toBeTruthy()
    expect(localRequestError('worthwhile.vercel.app', 'https://worthwhile.vercel.app', 'PUT', 'text/plain', true)).toBeTruthy()
  })
})

describe('Vercel database configuration', () => {
  it.each([
    { url: undefined, token: undefined, path: undefined },
    { url: 'libsql://example.turso.io', token: undefined, path: undefined },
    { url: undefined, token: 'test-token', path: undefined },
    { url: 'file:/tmp/plan.sqlite', token: 'test-token', path: undefined },
    { url: 'libsql://example.turso.io', token: 'test-token', path: '/tmp/plan.sqlite' },
  ])('rejects unsafe hosted storage configuration: $url / $path', ({ url, token, path }) => {
    vi.stubGlobal('useRuntimeConfig', () => ({ databasePath: '.data/networth.sqlite' }))
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('TURSO_DB_URL', url)
    vi.stubEnv('TURSO_DB_TOKEN', token)
    vi.stubEnv('NUXT_DATABASE_PATH', path)
    expect(() => getPlanRepository()).toThrow('Vercel requires')
  })
})