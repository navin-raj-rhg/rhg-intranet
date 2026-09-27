import { desc, eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { expensePayoutBatches, profiles } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'

export default defineEventHandler(async (event) => {
  await requireToolRole(event, 'expense-claims', ['manager'])
  const db = useDb()

  const rows = await db
    .select({
      batch: expensePayoutBatches,
      runByName: profiles.fullName,
      runByEmail: profiles.email
    })
    .from(expensePayoutBatches)
    .leftJoin(profiles, eq(profiles.id, expensePayoutBatches.runBy))
    .orderBy(desc(expensePayoutBatches.runAt))

  return rows.map(row => ({
    ...row.batch,
    runByName: row.runByName,
    runByEmail: row.runByEmail
  }))
})
