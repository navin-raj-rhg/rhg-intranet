import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { leaveApplications } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { getManagerIdsOf } from '~~/server/utils/toolTeams'
import { LEAVE_TOOL_ID } from '~~/server/utils/leaveBalance'
import { evaluateLeaveRequest } from '~~/server/utils/leaveRequest'

const bodySchema = z.object({
  leaveTypeId: z.number().int().positive(),
  startDate: z.string().date(), // 'YYYY-MM-DD'
  endDate: z.string().date(),
  startHalfDay: z.boolean().default(false),
  endHalfDay: z.boolean().default(false),
  reason: z.string().trim().max(1000).optional(),
  // From POST /api/storage/upload-url (toolId 'leave-applications') first.
  attachmentKey: z.string().min(1).optional()
})

// Only the 'employee' role (or the owner, testing) applies for leave. Managers
// approve - a manager who also takes leave holds both roles.
export default defineEventHandler(async (event) => {
  const { profile, role } = await requireToolRole(event, LEAVE_TOOL_ID, ['employee'])

  // Every employee needs at least one linked manager, or nobody could approve
  // the request. (The owner is exempt - testing only.)
  if (role !== 'owner' && (await getManagerIdsOf(LEAVE_TOOL_ID, profile.id)).length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'You have no approving manager yet. Ask the workspace owner to link you to a manager.'
    })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  // An attachment must live under this tool's own storage prefix. Otherwise
  // someone could point an application at another tool's file (e.g. an
  // expense receipt) and read it through this tool's download route.
  if (body.attachmentKey && !body.attachmentKey.startsWith(`${LEAVE_TOOL_ID}/`)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid attachment.' })
  }

  const db = useDb()
  const result = await evaluateLeaveRequest(db, profile.id, body)
  if (!result.ok) {
    throw createError({ statusCode: result.status, statusMessage: result.message })
  }

  const [application] = await db
    .insert(leaveApplications)
    .values({
      employeeId: profile.id,
      leaveTypeId: body.leaveTypeId,
      startDate: body.startDate,
      endDate: body.endDate,
      startHalfDay: body.startHalfDay,
      endHalfDay: body.endHalfDay,
      days: result.days.toFixed(1),
      reason: body.reason || null,
      attachmentKey: body.attachmentKey ?? null
      // status defaults to 'pending'
    })
    .returning()

  // balanceChecks with `exceeds: true` are a warning, not a block.
  return { application, balanceChecks: result.balanceChecks }
})
