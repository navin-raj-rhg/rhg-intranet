import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { leaveApplicationStatus } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { getManagedEmployeeIds } from '~~/server/utils/toolTeams'
import { LEAVE_TOOL_ID, todayISO } from '~~/server/utils/leaveBalance'
import { listLeaveApplications } from '~~/server/utils/leaveRequest'
import { canCancelLeave } from '~~/shared/utils/leaveRules'

const querySchema = z.object({
  status: z.enum(leaveApplicationStatus.enumValues).optional(),
  // 'mine' (default, least privilege) = the caller's own applications.
  // 'team' = applications from employees linked to the caller as their manager
  // (the owner sees everyone's).
  scope: z.enum(['mine', 'team']).default('mine')
})

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  const { profile, roles } = await requireToolRole(
    event,
    LEAVE_TOOL_ID,
    query.scope === 'team' ? ['manager'] : ['employee']
  )

  let employeeIds: string[] | 'all'
  if (query.scope === 'mine') {
    employeeIds = [profile.id]
  } else if (roles.includes('owner')) {
    employeeIds = 'all'
  } else {
    // A manager only ever sees their own team.
    employeeIds = await getManagedEmployeeIds(LEAVE_TOOL_ID, profile.id)
  }

  const rows = await listLeaveApplications(useDb(), { employeeIds, status: query.status })

  const today = todayISO()
  return rows.map(r => ({
    ...r,
    // Only the applicant can cancel, so this is false on other people's rows.
    canCancel: r.employeeId === profile.id && canCancelLeave(r.status, r.startDate, today)
  }))
})
