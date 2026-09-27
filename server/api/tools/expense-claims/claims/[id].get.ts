import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { getDownloadUrl } from '~~/server/utils/r2'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// Tool-specific, permission-checked download route - per the note in
// server/api/storage/download-url.get.ts, this is what a tool with its own
// table should do instead of proxying through the generic route: look up
// the record, check ownership/role, then call getDownloadUrl() directly.
export default defineEventHandler(async (event) => {
  const { profile, role } = await requireToolRole(event, 'expense-claims', ['employee', 'manager'])
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  const db = useDb()
  const claim = await db.query.expenseClaims.findFirst({
    where: (c, { eq }) => eq(c.id, id)
  })

  if (!claim) {
    throw createError({ statusCode: 404, statusMessage: 'Claim not found' })
  }

  // Employees can only look at their own claims; managers/owner can look at
  // any claim.
  if (role === 'employee' && claim.employeeId !== profile.id) {
    throw createError({ statusCode: 403, statusMessage: 'Not your claim' })
  }

  const receiptUrl = await getDownloadUrl(claim.receiptKey)

  return { ...claim, receiptUrl }
})
