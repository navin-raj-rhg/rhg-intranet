import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { expenseClaims } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, 'expense-claims', ['manager'])
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  const db = useDb()
  const existing = await db.query.expenseClaims.findFirst({
    where: (c, { eq }) => eq(c.id, id)
  })

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Claim not found' })
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
    .where(eq(expenseClaims.id, id))
    .returning()

  return updated
})
