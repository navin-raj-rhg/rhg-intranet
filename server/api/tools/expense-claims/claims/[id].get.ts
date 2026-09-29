import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { getDownloadUrl } from '~~/server/utils/r2'
import { isManagerOf } from '~~/server/utils/toolTeams'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// Tool-specific, permission-checked download route - per the note in
// server/api/storage/download-url.get.ts, this is what a tool with its own
// table should do instead of proxying through the generic route: look up
// the record, check ownership/role, then call getDownloadUrl() directly.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, 'expense-claims', ['employee', 'manager'])
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  const db = useDb()
  const claim = await db.query.expenseClaims.findFirst({
    where: (c, { eq }) => eq(c.id, id)
  })

  if (!claim) {
    throw createError({ statusCode: 404, statusMessage: 'Claim not found' })
  }

  // You can view your own claims. A manager can view claims from employees
  // linked to them; the owner can view anything. Nobody else can.
  if (claim.employeeId !== profile.id && !roles.includes('owner')) {
    const isTeamManager = roles.includes('manager')
      && await isManagerOf('expense-claims', profile.id, claim.employeeId)
    if (!isTeamManager) {
      throw createError({ statusCode: 403, statusMessage: 'Not your claim' })
    }
  }

  const receiptUrl = await getDownloadUrl(claim.receiptKey)

  return { ...claim, receiptUrl }
})
