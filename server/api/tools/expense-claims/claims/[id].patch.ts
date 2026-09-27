import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { expenseCategory, expenseClaims } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

const bodySchema = z.object({
  category: z.enum(expenseCategory.enumValues).optional(),
  amount: z.number().positive().optional(),
  description: z.string().min(1).optional(),
  expenseDate: z.string().date().optional(),
  // Lets an employee swap in a new receipt (re-upload via
  // POST /api/storage/upload-url first, then pass the new key here).
  receiptKey: z.string().min(1).optional()
})

export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, 'expense-claims', ['employee'])
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)

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
    throw createError({ statusCode: 409, statusMessage: 'Only submitted claims can be edited' })
  }

  const [updated] = await db
    .update(expenseClaims)
    .set({
      ...body,
      amount: body.amount !== undefined ? body.amount.toFixed(2) : undefined,
      updatedAt: new Date()
    })
    .where(eq(expenseClaims.id, id))
    .returning()

  return updated
})
