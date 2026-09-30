import { getManagerIdsOf } from '~~/server/utils/toolTeams'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { LEAVE_TOOL_ID } from '~~/server/utils/leaveBalance'

export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, LEAVE_TOOL_ID, ['employee', 'manager'])

  // Anyone who can apply (employees, and the owner) needs a linked manager,
  // otherwise nobody could approve their leave. A manager who does not take
  // leave themselves does not. The page uses this flag to explain why.
  const canApply = roles.includes('employee') || roles.includes('owner')
  const missingManager = canApply
    && (await getManagerIdsOf(LEAVE_TOOL_ID, profile.id)).length === 0

  return { roles, missingManager }
})
