import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { expenseClaims } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { isManagerOf } from '~~/server/utils/toolTeams'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

export default defineEventHandler(async (event) => {
  const { profile, role } = await requireToolRole(event, 'expense-claims', ['manager'])
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  const db = useDb()
  const existing = await db.query.expenseClaims.findFirst({
    where: (c, { eq }) => eq(c.id, id)
  })

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Claim not found' })
  }
  // Only a manager linked to this employee (or the owner) can approve.
  if (role !== 'owner' && !(await isManagerOf('expense-claims', profile.id, existing.employeeId))) {
    throw createError({ statusCode: 403, statusMessage: 'This employee is not on your team' })
  }
  if (existing.status !== 'submitted') {
    throw createError({ statusCode: 409, statusMessage: 'Only submitted claims can be approved' })
  }

  const [updated] = await db
    .update(expenseClaims)
    .set({
      status: 'approved',
      approvedBy: profile.id,
      approvedAt: new Date(),
      updatedAt: new Date()
    })
    // Re-check the status in the UPDATE itself, so if two linked managers
    // click Approve at the same moment, only the first one wins.
    .where(and(eq(expenseClaims.id, id), eq(expenseClaims.status, 'submitted')))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 409, statusMessage: 'This claim was already approved by another manager' })
  }

  return updated
})
