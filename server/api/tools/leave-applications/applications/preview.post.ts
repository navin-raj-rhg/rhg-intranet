import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { LEAVE_TOOL_ID } from '~~/server/utils/leaveBalance'
import { evaluateLeaveRequest } from '~~/server/utils/leaveRequest'

const bodySchema = z.object({
  leaveTypeId: z.number().int().positive(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  startHalfDay: z.boolean().default(false),
  endHalfDay: z.boolean().default(false)
})

// Runs exactly the checks that submitting would, but saves nothing. The form
// calls this as the person fills it in. A rule failure is a normal answer
// ({ ok: false, message }), not an HTTP error, so the form can show it inline.
export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, LEAVE_TOOL_ID, ['employee'])
  const body = await readValidatedBody(event, bodySchema.parse)

  const result = await evaluateLeaveRequest(useDb(), profile.id, body)
  if (!result.ok) return { ok: false as const, message: result.message }

  return { ok: true as const, days: result.days, balanceChecks: result.balanceChecks, holidaysSkipped: result.holidaysSkipped }
})
