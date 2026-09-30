import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'
import { createLeaveAdjustment } from '~~/server/utils/leaveAdmin'

// Detailed limits (multiples of 0.5, cycle year range, type has a balance) are
// enforced in createLeaveAdjustment so they hold for any caller.
const bodySchema = z.object({
  employeeId: z.string().uuid(),
  leaveTypeId: z.number().int().positive(),
  cycleStartYear: z.number().int(),
  days: z.number(), // positive adds days, negative removes them
  reason: z.string().trim().min(1).max(300)
})

// Owner-only. Adds a manual correction to one balance (carry-forward, a fix,
// or a negative one to zero out an entitlement that doesn't apply to someone).
export default defineEventHandler(async (event) => {
  const owner = await requireOwner(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  return createLeaveAdjustment(useDb(), { ...body, createdBy: owner.id })
})
