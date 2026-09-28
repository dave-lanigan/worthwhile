import { createClient, type Client, type Config } from '@libsql/client'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPlanProfileSchema, emptyPlan, emptyUserProfile, financialPlanSchema, planProfileSchema, savePlanProfileSchema, savePlanSchema, savedPlanProfileSchema, savedUserProfileSchema, type SavedPlan, type SavedPlanProfile, type SavedUserProfile } from '../../shared/schemas/financial-plan'
import { projectNetWorth } from '../../shared/utils/projection'

export class RevisionConflict extends Error {}

export async function createPlanRepository(connection: string | Config) {
  if (typeof connection === 'string' && connection !== ':memory:') mkdirSync(dirname(resolve(connection)), { recursive: true })
  const database = createClient(typeof connection === 'string'
    ? { url: connection === ':memory:' ? connection : pathToFileURL(resolve(connection)).href }
    : connection)
  try {
    await database.execute('CREATE TABLE IF NOT EXISTS user_plan (user_id TEXT PRIMARY KEY NOT NULL CHECK (length(user_id) > 0), schema_version INTEGER NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL)')
    await database.execute('CREATE TABLE IF NOT EXISTS user_profile (user_id TEXT PRIMARY KEY NOT NULL CHECK (length(user_id) > 0), schema_version INTEGER NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL)')
    await database.execute('CREATE TABLE IF NOT EXISTS plan_profile (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL CHECK (length(user_id) > 0), schema_version INTEGER NOT NULL, revision INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, document TEXT NOT NULL)')
    await database.execute('CREATE INDEX IF NOT EXISTS plan_profile_user_id ON plan_profile (user_id)')
  } catch (error) {
    database.close()
    throw error
  }

  async function readFrom(executor: Pick<Client, 'execute'>, userId: string): Promise<SavedPlan> {
    if (!userId.trim()) throw new Error('A signed-in user is required.')
    const { rows } = await executor.execute({ sql: 'SELECT schema_version, revision, document FROM user_plan WHERE user_id = ?', args: [userId] })
    const row = rows[0]
    if (!row) return { plan: emptyPlan(), revision: 0 }
    if (row.schema_version !== 1) throw new Error('Unsupported database schema.')
    return savePlanSchema.parse({ plan: financialPlanSchema.parse(JSON.parse(String(row.document))), revision: row.revision })
  }

  async function readProfileFrom(executor: Pick<Client, 'execute'>, userId: string): Promise<SavedUserProfile> {
    if (!userId.trim()) throw new Error('A signed-in user is required.')
    const { rows } = await executor.execute({ sql: 'SELECT schema_version, revision, document FROM user_profile WHERE user_id = ?', args: [userId] })
    const row = rows[0]
    if (!row) return { profile: emptyUserProfile(), revision: 0 }
    if (row.schema_version !== 1) throw new Error('Unsupported database schema.')
    return savedUserProfileSchema.parse({ profile: { ...emptyUserProfile(), ...JSON.parse(String(row.document)) }, revision: row.revision })
  }

  async function writeProfile(userId: string, input: SavedUserProfile): Promise<SavedUserProfile> {
    const { profile, revision } = savedUserProfileSchema.parse(input)
    const transaction = await database.transaction('write')
    try {
      const current = await readProfileFrom(transaction, userId)
      if (revision !== current.revision) throw new RevisionConflict('This profile was changed in another tab.')
      const nextRevision = revision + 1
      await transaction.execute({
        sql: 'INSERT INTO user_profile (user_id, schema_version, revision, document) VALUES (?, 1, ?, ?) ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, document = excluded.document',
        args: [userId, nextRevision, JSON.stringify(profile)],
      })
      await transaction.commit()
      return { profile, revision: nextRevision }
    } catch (error) {
      await transaction.rollback()
      throw error
    } finally {
      transaction.close()
    }
  }

  async function listProfiles(userId: string) {
    if (!userId.trim()) throw new Error('A signed-in user is required.')
    const { rows } = await database.execute({ sql: 'SELECT id, name, description FROM plan_profile WHERE user_id = ? ORDER BY rowid DESC', args: [userId] })
    return rows.map(row => planProfileSchema.parse({ id: String(row.id), name: String(row.name), description: String(row.description) }))
  }

  async function readProfilePlan(userId: string, id: string): Promise<SavedPlanProfile> {
    if (!userId.trim()) throw new Error('A signed-in user is required.')
    const { rows } = await database.execute({ sql: 'SELECT id, schema_version, revision, name, description, document FROM plan_profile WHERE user_id = ? AND id = ?', args: [userId, id] })
    const row = rows[0]
    if (!row) throw new Error('Profile not found.')
    if (row.schema_version !== 1) throw new Error('Unsupported database schema.')
    return savedPlanProfileSchema.parse({ id: String(row.id), name: String(row.name), description: String(row.description), plan: financialPlanSchema.parse(JSON.parse(String(row.document))), revision: row.revision })
  }

  async function createProfile(userId: string, input: unknown): Promise<SavedPlanProfile> {
    if (!userId.trim()) throw new Error('A signed-in user is required.')
    const { name, description, plan } = createPlanProfileSchema.parse(input)
    projectNetWorth(plan)
    const id = crypto.randomUUID()
    await database.execute({ sql: 'INSERT INTO plan_profile (id, user_id, schema_version, revision, name, description, document) VALUES (?, ?, 1, 0, ?, ?, ?)', args: [id, userId, name, description, JSON.stringify(plan)] })
    return { id, name, description, plan, revision: 0 }
  }

  async function writeProfilePlan(userId: string, id: string, input: unknown): Promise<SavedPlanProfile> {
    const { plan, revision } = savePlanProfileSchema.parse(input)
    projectNetWorth(plan)
    const current = await readProfilePlan(userId, id)
    if (revision !== current.revision) throw new RevisionConflict('This profile was changed in another tab.')
    const nextRevision = revision + 1
    await database.execute({ sql: 'UPDATE plan_profile SET revision = ?, document = ? WHERE user_id = ? AND id = ?', args: [nextRevision, JSON.stringify(plan), userId, id] })
    return { ...current, plan, revision: nextRevision }
  }

  async function deleteProfile(userId: string, id: string) {
    if (!userId.trim()) throw new Error('A signed-in user is required.')
    await database.execute({ sql: 'DELETE FROM plan_profile WHERE user_id = ? AND id = ?', args: [userId, id] })
  }

  async function write(userId: string, input: SavedPlan): Promise<SavedPlan> {
    const { plan, revision } = savePlanSchema.parse(input)
    projectNetWorth(plan)
    const transaction = await database.transaction('write')
    try {
      const current = await readFrom(transaction, userId)
      if (revision !== current.revision) throw new RevisionConflict('This plan was changed in another tab.')
      const nextRevision = revision + 1
      await transaction.execute({
        sql: 'INSERT INTO user_plan (user_id, schema_version, revision, document) VALUES (?, 1, ?, ?) ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, document = excluded.document',
        args: [userId, nextRevision, JSON.stringify(plan)],
      })
      await transaction.commit()
      return { plan, revision: nextRevision }
    } catch (error) {
      await transaction.rollback()
      throw error
    } finally {
      transaction.close()
    }
  }

  return { read: (userId: string) => readFrom(database, userId), write, listProfiles, readProfilePlan, createProfile, writeProfilePlan, deleteProfile, readProfile: (userId: string) => readProfileFrom(database, userId), writeProfile, close: () => database.close() }
}