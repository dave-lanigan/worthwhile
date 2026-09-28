import { createPlanRepository } from './plan-repository'

let repository: ReturnType<typeof createPlanRepository> | undefined

export function getPlanRepository() {
  if (!repository) {
    const { databasePath } = useRuntimeConfig()
    const url = process.env.TURSO_DB_URL
    const authToken = process.env.TURSO_DB_TOKEN
    if (process.env.VERCEL && (process.env.NUXT_DATABASE_PATH || !url || !authToken || !url.startsWith('libsql://'))) {
      throw new Error('Vercel requires a libsql:// TURSO_DB_URL and TURSO_DB_TOKEN; NUXT_DATABASE_PATH must not be set.')
    }
    const useTurso = !process.env.NUXT_DATABASE_PATH && Boolean(url || authToken)
    if (useTurso && (!url || !authToken)) throw new Error('TURSO_DB_URL and TURSO_DB_TOKEN must both be configured.')
    repository = createPlanRepository(useTurso ? { url: url!, authToken } : databasePath).catch((error) => {
      repository = undefined
      throw error
    })
  }
  return repository
}

export async function closeDatabase() {
  const current = repository
  repository = undefined
  const connection = await current
  connection?.close()
}