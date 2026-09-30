import { getManagerIdsOf } from '~~/server/utils/toolTeams'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { LEAVE_TOOL_ID } from '~~/server/utils/leaveBalance'

export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, LEAVE_TOOL_ID, ['employee', 'manager'])

  // An employee with no linked manager can't apply for leave (nobody could
  // approve it) - the page uses this flag to explain why.
  const isEmployeeOnly = roles.includes('employee') && !roles.includes('owner')
  const missingManager = isEmployeeOnly
    && (await getManagerIdsOf(LEAVE_TOOL_ID, profile.id)).length === 0

  return { roles, missingManager }
})
