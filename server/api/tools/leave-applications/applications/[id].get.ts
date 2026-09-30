import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { getDownloadUrl } from '~~/server/utils/r2'
import { isManagerOf } from '~~/server/utils/toolTeams'
import { LEAVE_TOOL_ID, todayISO } from '~~/server/utils/leaveBalance'
import { getLeaveApplicationDetail, getLeaveBalanceImpact } from '~~/server/utils/leaveRequest'
import { canCancelLeave } from '~~/shared/utils/leaveRules'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// Tool-specific, permission-checked detail route (and attachment download),
// like the Expense Claims one: look up the record, check who is asking, then
// call getDownloadUrl() directly rather than the generic storage route.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, LEAVE_TOOL_ID, ['employee', 'manager'])
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  const application = await getLeaveApplicationDetail(useDb(), id)
  if (!application) {
    throw createError({ statusCode: 404, statusMessage: 'Leave application not found' })
  }

  // You can view your own. A manager can view their team's; the owner anyone's.
  if (application.employeeId !== profile.id && !roles.includes('owner')) {
    const isTeamManager = roles.includes('manager')
      && await isManagerOf(LEAVE_TOOL_ID, profile.id, application.employeeId)
    if (!isTeamManager) {
      throw createError({ statusCode: 403, statusMessage: 'Not your leave application' })
    }
  }

  const attachmentUrl = application.attachmentKey
    ? await getDownloadUrl(application.attachmentKey)
    : null

  return {
    ...application,
    attachmentUrl,
    // For a pending application: how approving it changes the employee's
    // balance (advisory). Null once it has been decided.
    balanceImpact: await getLeaveBalanceImpact(useDb(), application),
    // Only the applicant can cancel, so this is false for a manager viewing.
    canCancel: application.employeeId === profile.id
      && canCancelLeave(application.status, application.startDate, todayISO())
  }
})
