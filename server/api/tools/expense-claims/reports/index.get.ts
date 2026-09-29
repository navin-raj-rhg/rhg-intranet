import { desc, eq, inArray } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { expensePayoutBatches, profiles } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { getPeerManagerIds } from '~~/server/utils/toolTeams'

export default defineEventHandler(async (event) => {
  const { profile, role } = await requireToolRole(event, 'expense-claims', ['manager'])
  const db = useDb()

  // A manager sees reports run by themselves or a co-manager on the same
  // team - never another team's. The owner sees all.
  const runByIds = role === 'owner' ? null : await getPeerManagerIds('expense-claims', profile.id)

  const rows = await db
    .select({
      batch: expensePayoutBatches,
      runByName: profiles.fullName,
      runByEmail: profiles.email
    })
    .from(expensePayoutBatches)
    .leftJoin(profiles, eq(profiles.id, expensePayoutBatches.runBy))
    .where(runByIds ? inArray(expensePayoutBatches.runBy, runByIds) : undefined)
    .orderBy(desc(expensePayoutBatches.runAt))

  return rows.map(row => ({
    ...row.batch,
    runByName: row.runByName,
    runByEmail: row.runByEmail
  }))
})
