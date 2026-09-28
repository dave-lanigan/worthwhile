import { createClient, type Client, type Config } from '@libsql/client'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { emptyPlan, financialPlanSchema, savePlanSchema, type SavedPlan } from '../../shared/schemas/financial-plan'
import { projectNetWorth } from '../../shared/utils/projection'

export class RevisionConflict extends Error {}

export async function createPlanRepository(connection: string | Config) {
  if (typeof connection === 'string' && connection !== ':memory:') mkdirSync(dirname(resolve(connection)), { recursive: true })
  const database = createClient(typeof connection === 'string'
    ? { url: connection === ':memory:' ? connection : pathToFileURL(resolve(connection)).href }
    : connection)
  try {
    await database.execute('CREATE TABLE IF NOT EXISTS user_plan (user_id TEXT PRIMARY KEY NOT NULL CHECK (length(user_id) > 0), schema_version INTEGER NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL)')
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

  return { read: (userId: string) => readFrom(database, userId), write, close: () => database.close() }
}