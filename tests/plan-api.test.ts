import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { emptyPlan } from '../shared/schemas/financial-plan'
import { createPlanRepository, RevisionConflict } from '../server/utils/plan-repository'
import { localRequestError } from '../server/utils/local-request'
import { requirePlanOwner } from '../server/utils/plan-auth'
import type { H3Event } from 'h3'

describe('libSQL plan storage', () => {
  it('preserves an existing SQLite plan when switching drivers', async () => {
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
      expect(await repository.read()).toEqual({ plan, revision: 7 })
      expect(await other.read()).toEqual({ plan, revision: 7 })
      const saved = await repository.write({ plan, revision: 7 })
      await expect(other.write({ plan, revision: 7 })).rejects.toThrow(RevisionConflict)
      expect(await other.read()).toEqual(saved)
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
      expect(await repository.read()).toEqual({ plan: emptyPlan(), revision: 0 })
      const plan = emptyPlan()
      plan.incomes = [{ id: 'income', name: 'Salary', amount: 20000, frequency: 'monthly' }]
      plan.investments = [
        { id: 'fund', name: 'Fund', balance: 50000, annualRoi: 5, allocation: 60 },
        { id: 'hsa', name: 'HSA', balance: 10000, annualRoi: 0, monthlyContribution: 2500 },
      ]
      plan.expenses = [{ id: 'expense', name: 'Rent', amount: 10000, frequency: 'monthly' }]
      plan.liabilities = [{ id: 'loan', name: 'Loan', balance: 10000, apr: 5, payment: 1000 }]
      const saved = await repository.write({ plan, revision: 0 })
      expect(saved.revision).toBe(1)
      await expect(repository.write({ plan: emptyPlan(), revision: 0 })).rejects.toThrow(RevisionConflict)
      await expect(repository.write({ plan: { ...plan, startingCash: -1 }, revision: 1 })).rejects.toThrow()
      expect(await repository.read()).toEqual(saved)
      repository.close()
      const reopened = await createPlanRepository(path)
      expect(await reopened.read()).toEqual(saved)
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
      raw.prepare('INSERT INTO plan VALUES (1, 1, 1, ?)').run('{broken')
      await expect(repository.read()).rejects.toThrow()
      await expect(repository.write({ plan: emptyPlan(), revision: 1 })).rejects.toThrow()
      expect(raw.prepare('SELECT document FROM plan').get()).toEqual({ document: '{broken' })
      raw.prepare('UPDATE plan SET schema_version = 2').run()
      await expect(repository.read()).rejects.toThrow('Unsupported')
    } finally {
      raw.close()
      repository.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('single-owner plan authorization', () => {
  const event = (userId: string | null, isAuthenticated = !!userId) => ({ context: { auth: () => ({ userId, isAuthenticated }) } }) as unknown as H3Event

  it('requires an authenticated Clerk session, even when ownership is not configured', () => {
    expect(() => requirePlanOwner(event(null), '')).toThrow(expect.objectContaining({ statusCode: 401 }))
    expect(() => requirePlanOwner(event('user_owner', false), 'user_owner')).toThrow(expect.objectContaining({ statusCode: 401 }))
    expect(() => requirePlanOwner({ context: {} } as H3Event, 'user_owner')).toThrow(expect.objectContaining({ statusCode: 401 }))
  })

  it('fails closed without an explicit owner and rejects other signed-in users', () => {
    expect(() => requirePlanOwner(event('user_owner'), '')).toThrow(expect.objectContaining({ statusCode: 503 }))
    expect(() => requirePlanOwner(event('user_other'), 'user_owner')).toThrow(expect.objectContaining({ statusCode: 403 }))
    expect(requirePlanOwner(event('user_owner'), 'user_owner')).toBe('user_owner')
  })
})

it('rejects foreign origins, nonlocal hosts, and non-JSON writes', () => {
  expect(localRequestError('127.0.0.1:3000', 'http://127.0.0.1:3000', 'PUT', 'application/json')).toBeNull()
  expect(localRequestError('localhost:3000', undefined, 'GET', undefined)).toBeNull()
  expect(localRequestError('attacker.test:3000', undefined, 'GET', undefined)).toBeTruthy()
  expect(localRequestError('localhost:3000', 'https://attacker.test', 'PUT', 'application/json')).toBeTruthy()
  expect(localRequestError('localhost:3000', undefined, 'PUT', 'text/plain')).toBeTruthy()
})