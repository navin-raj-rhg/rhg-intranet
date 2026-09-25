import { defineConfig } from 'drizzle-kit'
import 'dotenv/config'

// drizzle-kit runs outside of Nuxt, so it reads .env directly (not runtimeConfig).
// Always point migrations at the DIRECT connection (port 5432), not the pooler.
const dbUrl = process.env.NUXT_SUPABASE_DB_URL

if (!dbUrl) {
  throw new Error(
    'NUXT_SUPABASE_DB_URL is not set. Copy .env.example to .env and fill in your Supabase direct connection string.'
  )
}

export default defineConfig({
  schema: './server/db/schema/index.ts',
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl
  },
  strict: true,
  verbose: true
})
