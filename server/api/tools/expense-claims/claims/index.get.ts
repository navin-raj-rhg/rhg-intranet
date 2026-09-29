import { z } from 'zod'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { expenseClaimStatus, expenseClaims, profiles } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { getManagedEmployeeIds } from '~~/server/utils/toolTeams'

const querySchema = z.object({
  status: z.enum(expenseClaimStatus.enumValues).optional(),
  // 'mine' (default, least privilege) = the caller's own claims.
  // 'team' = claims from employees linked to the caller as their manager.
  scope: z.enum(['mine', 'team']).default('mine')
})

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  const { profile, role } = await requireToolRole(
    event,
    'expense-claims',
    query.scope === 'team' ? ['manager'] : ['employee']
  )

  const db = useDb()
  const conditions = []

  if (query.scope === 'mine') {
    conditions.push(eq(expenseClaims.employeeId, profile.id))
  } else if (role !== 'owner') {
    // A manager only ever sees their own team. The owner sees everyone.
    const employeeIds = await getManagedEmployeeIds('expense-claims', profile.id)
    if (employeeIds.length === 0) return []
    conditions.push(inArray(expenseClaims.employeeId, employeeIds))
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
