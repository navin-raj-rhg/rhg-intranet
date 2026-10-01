import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { expenseClaims } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { deleteIfUnreferenced } from '~~/server/utils/storageCleanup'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// Deletes the claim and, best effort, its receipt file (unless something else
// still points to it). Anything missed is caught by the owner's storage clean-up.
export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, 'expense-claims', ['employee'])
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  const db = useDb()
  const existing = await db.query.expenseClaims.findFirst({
    where: (c, { eq }) => eq(c.id, id)
  })

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Claim not found' })
  }
  if (existing.employeeId !== profile.id) {
    throw createError({ statusCode: 403, statusMessage: 'Not your claim' })
  }
  if (existing.status !== 'submitted') {
    throw createError({ statusCode: 409, statusMessage: 'Only submitted claims can be deleted' })
  }

  await db.delete(expenseClaims).where(eq(expenseClaims.id, id))
  await deleteIfUnreferenced(db, existing.receiptKey)

  return { success: true }
})
