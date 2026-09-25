import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

/**
 * Lazily-created singleton Drizzle client, using Supabase's pooled
 * (transaction mode, port 6543) connection - safe for a serverless-style
 * Nitro app where many short-lived requests come in.
 *
 * `prepare: false` is required when talking to the pooler, since pgbouncer
 * in transaction mode doesn't support prepared statements.
 */
export function useDb() {
  if (_db) return _db

  const config = useRuntimeConfig()
  const connectionString = config.supabaseDbPoolUrl

  if (!connectionString) {
    throw new Error(
      'NUXT_SUPABASE_DB_POOL_URL is not set. Copy .env.example to .env and fill in your Supabase pooled connection string.'
    )
  }

  const client = postgres(connectionString, { prepare: false })
  _db = drizzle(client, { schema })
  return _db
}
