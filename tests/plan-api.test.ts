import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { emptyPlan } from '../shared/schemas/financial-plan'
import { createPlanRepository, RevisionConflict } from '../server/utils/plan-repository'
import { localRequestError } from '../server/utils/local-request'
import { requireSignedInUser } from '../server/utils/plan-auth'
import { createApp, defineEventHandler, getHeader, toNodeListener, type H3Event } from 'h3'
import getPlan from '../server/api/plan.get'
import putPlan from '../server/api/plan.put'
import { getPlanRepository } from '../server/utils/database'

vi.mock('../server/utils/database', () => ({ getPlanRepository: vi.fn() }))

describe('libSQL plan storage', () => {
  it('preserves the legacy plan without assigning it to a new account', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'worthwhile-test-'))
    const path = join(directory, 'plan.sqlite')
    const raw = new Database(path)
    const plan = emptyPlan()
    raw.exec('CREATE TABLE plan (id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL)')
    raw.prepare('INSERT INTO plan VALUES (1, 1, 7, ?)').run(JSON.stringify(plan))
    raw.close()
    const repository = await createPlanRepository(path)
    const other = await createPlanRepository(path)
    try {
      expect(await repository.read('user_first')).toEqual({ plan: emptyPlan(), revision: 0 })
      expect(await other.read('user_second')).toEqual({ plan: emptyPlan(), revision: 0 })
      const saved = await repository.write('user_first', { plan, revision: 0 })
      await expect(other.write('user_first', { plan, revision: 0 })).rejects.toThrow(RevisionConflict)
      expect(await other.read('user_first')).toEqual(saved)
      const legacy = new Database(path, { readonly: true })
      try {
        expect(legacy.prepare('SELECT revision, document FROM plan WHERE id = 1').get()).toEqual({ revision: 7, document: JSON.stringify(plan) })
      } finally {
        legacy.close()
      }
    } finally {
      repository.close()
      other.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('persists all categories across connections and rejects stale writes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'worthwhile-test-'))
    const path = join(directory, 'plan.sqlite')
    const repository = await createPlanRepository(path)
    try {
      expect(await repository.read('user_first')).toEqual({ plan: emptyPlan(), revision: 0 })
      const plan = emptyPlan()
      plan.incomes = [{ id: 'income', name: 'Salary', amount: 20000, frequency: 'monthly' }]
      plan.investments = [
        { id: 'fund', name: 'Fund', balance: 50000, annualRoi: 5, allocation: 60 },
        { id: 'hsa', name: 'HSA', balance: 10000, annualRoi: 0, monthlyContribution: 2500 },
      ]
      plan.expenses = [{ id: 'expense', name: 'Rent', amount: 10000, frequency: 'monthly' }]
      plan.liabilities = [{ id: 'loan', name: 'Loan', balance: 10000, apr: 5, payment: 1000 }]
      const saved = await repository.write('user_first', { plan, revision: 0 })
      expect(saved.revision).toBe(1)
      await expect(repository.write('user_first', { plan: emptyPlan(), revision: 0 })).rejects.toThrow(RevisionConflict)
      await expect(repository.write('user_first', { plan: { ...plan, startingCash: -1 }, revision: 1 })).rejects.toThrow()
      expect(await repository.read('user_first')).toEqual(saved)
      repository.close()
      const reopened = await createPlanRepository(path)
      expect(await reopened.read('user_first')).toEqual(saved)
      reopened.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('never overwrites a corrupt or unsupported saved document', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'worthwhile-test-'))
    const path = join(directory, 'plan.sqlite')
    const repository = await createPlanRepository(path)
    const raw = new Database(path)
    try {
      raw.prepare('INSERT INTO user_plan VALUES (?, 1, 1, ?)').run('user_first', '{broken')
      await expect(repository.read('user_first')).rejects.toThrow()
      await expect(repository.write('user_first', { plan: emptyPlan(), revision: 1 })).rejects.toThrow()
      expect(raw.prepare('SELECT document FROM user_plan').get()).toEqual({ document: '{broken' })
      raw.prepare('UPDATE user_plan SET schema_version = 2').run()
      await expect(repository.read('user_first')).rejects.toThrow('Unsupported')
    } finally {
      raw.close()
      repository.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

it('isolates each account and its revisions across connections', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'worthwhile-test-'))
  const path = join(directory, 'plan.sqlite')
  const repository = await createPlanRepository(path)
  const other = await createPlanRepository(path)
  try {
    const first = { ...emptyPlan(), startingCash: 12345 }
    const second = { ...emptyPlan(), startingCash: 67890 }
    await repository.write('user_first', { plan: first, revision: 0 })
    await other.write('user_second', { plan: second, revision: 0 })
    expect(await repository.read('user_first')).toEqual({ plan: first, revision: 1 })
    expect(await repository.read('user_second')).toEqual({ plan: second, revision: 1 })
    expect(await repository.read("' OR 1 = 1 --")).toEqual({ plan: emptyPlan(), revision: 0 })
    await expect(repository.read('')).rejects.toThrow('signed-in user')
    await expect(repository.write('', { plan: first, revision: 0 })).rejects.toThrow('signed-in user')
    await repository.write('user_first', { plan: first, revision: 1 })
    expect(await other.read('user_second')).toEqual({ plan: second, revision: 1 })
  } finally {
    repository.close()
    other.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('signed-in plan authorization', () => {
  const event = (userId: string | null, isAuthenticated = !!userId) => ({ context: { auth: () => ({ userId, isAuthenticated }) } }) as unknown as H3Event

  it('requires an authenticated Clerk session', () => {
    expect(() => requireSignedInUser(event(null))).toThrow(expect.objectContaining({ statusCode: 401 }))
    expect(() => requireSignedInUser(event('user_first', false))).toThrow(expect.objectContaining({ statusCode: 401 }))
    expect(() => requireSignedInUser({ context: {} } as H3Event)).toThrow(expect.objectContaining({ statusCode: 401 }))
  })

  it('accepts every signed-in account without extra configuration', () => {
    expect(requireSignedInUser(event('user_first'))).toBe('user_first')
    expect(requireSignedInUser(event('user_second'))).toBe('user_second')
  })
})

it('API handlers use only the verified session identity for reads and writes', async () => {
  const repository = await createPlanRepository(':memory:')
  vi.mocked(getPlanRepository).mockResolvedValue(repository)
  const app = createApp().use(defineEventHandler((event) => {
    const userId = getHeader(event, 'x-test-session') ?? null
    event.context.auth = (() => ({ userId, isAuthenticated: !!userId })) as unknown as H3Event['context']['auth']
  })).use('/api/plan', defineEventHandler(event => event.method === 'GET' ? getPlan(event) : putPlan(event)))
  const server = createServer(toNodeListener(app))
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP port')
    const url = `http://127.0.0.1:${address.port}/api/plan`
    expect((await fetch(url)).status).toBe(401)
    expect((await fetch(url, { method: 'PUT' })).status).toBe(401)
    expect(getPlanRepository).not.toHaveBeenCalled()
    const firstPlan = { ...emptyPlan(), startingCash: 12345 }
    const secondPlan = { ...emptyPlan(), startingCash: 67890 }
    const first = await fetch(url, {
      method: 'PUT', headers: { 'x-test-session': 'user_first', 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: firstPlan, revision: 0 }),
    })
    expect(first.status).toBe(200)
    const secondHeaders = { 'x-test-session': 'user_second', 'Content-Type': 'application/json' }
    expect(await (await fetch(`${url}?userId=user_first`, { headers: secondHeaders })).json()).toEqual({ plan: emptyPlan(), revision: 0 })
    const second = await fetch(url, {
      method: 'PUT', headers: secondHeaders,
      body: JSON.stringify({ userId: 'user_first', plan: secondPlan, revision: 0 }),
    })
    expect(second.status).toBe(200)
    expect(await (await fetch(url, { headers: { 'x-test-session': 'user_first' } })).json()).toEqual({ plan: firstPlan, revision: 1 })
    expect(await (await fetch(url, { headers: secondHeaders })).json()).toEqual({ plan: secondPlan, revision: 1 })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    repository.close()
    vi.mocked(getPlanRepository).mockReset()
  }
})

it('rejects foreign origins, nonlocal hosts, and non-JSON writes', () => {
  expect(localRequestError('127.0.0.1:3000', 'http://127.0.0.1:3000', 'PUT', 'application/json')).toBeNull()
  expect(localRequestError('localhost:3000', undefined, 'GET', undefined)).toBeNull()
  expect(localRequestError('attacker.test:3000', undefined, 'GET', undefined)).toBeTruthy()
  expect(localRequestError('localhost:3000', 'https://attacker.test', 'PUT', 'application/json')).toBeTruthy()
  expect(localRequestError('localhost:3000', undefined, 'PUT', 'text/plain')).toBeTruthy()
})