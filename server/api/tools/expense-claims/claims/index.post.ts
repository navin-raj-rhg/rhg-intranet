import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { expenseCategory, expenseClaims } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'

const bodySchema = z.object({
  category: z.enum(expenseCategory.enumValues),
  amount: z.number().positive(),
  description: z.string().min(1),
  expenseDate: z.string().date(), // 'YYYY-MM-DD'
  receiptKey: z.string().min(1) // from POST /api/storage/upload-url first
})

// Only 'employee' role (or the owner, testing) can submit claims. Managers
// approve/pay - they don't submit through this tool.
export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, 'expense-claims', ['employee'])

  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const [claim] = await db
    .insert(expenseClaims)
    .values({
      employeeId: profile.id,
      category: body.category,
      amount: body.amount.toFixed(2),
      description: body.description,
      expenseDate: body.expenseDate,
      receiptKey: body.receiptKey
      // status defaults to 'submitted'
    })
    .returning()

  return claim
})
