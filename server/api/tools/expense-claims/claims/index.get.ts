import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { expenseClaimStatus, expenseClaims, profiles } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'

const querySchema = z.object({
  status: z.enum(expenseClaimStatus.enumValues).optional()
})

export default defineEventHandler(async (event) => {
  const { profile, role } = await requireToolRole(event, 'expense-claims', ['employee', 'manager'])
  const query = await getValidatedQuery(event, querySchema.parse)

  const db = useDb()

  const conditions = []
  // Employees only ever see their own claims. Managers and the owner see
  // everyone's - that's the whole point of the approval queue.
  if (role === 'employee') {
    conditions.push(eq(expenseClaims.employeeId, profile.id))
  }
  if (query.status) {
    conditions.push(eq(expenseClaims.status, query.status))
  }

  const rows = await db
    .select({
      claim: expenseClaims,
      employeeName: profiles.fullName,
      employeeEmail: profiles.email
    })
    .from(expenseClaims)
    .leftJoin(profiles, eq(profiles.id, expenseClaims.employeeId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(expenseClaims.expenseDate))

  return rows.map(row => ({
    ...row.claim,
    employeeName: row.employeeName,
    employeeEmail: row.employeeEmail
  }))
})
