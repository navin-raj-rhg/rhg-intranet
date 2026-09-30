import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { isManagerOf } from '~~/server/utils/toolTeams'
import { LEAVE_TOOL_ID } from '~~/server/utils/leaveBalance'
import { decideLeaveApplication } from '~~/server/utils/leaveRequest'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })
const bodySchema = z.object({ note: z.string().trim().max(500).optional() })

// A linked manager (or the owner) rejects a pending application, with an
// optional note the applicant can read. The rules, including the guard against
// two people acting at once, are in decideLeaveApplication().
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, LEAVE_TOOL_ID, ['manager'])
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)

  return decideLeaveApplication(useDb(), {
    id,
    deciderId: profile.id,
    decision: 'rejected',
    note: body.note,
    canDecideFor: async employeeId =>
      roles.includes('owner') || await isManagerOf(LEAVE_TOOL_ID, profile.id, employeeId)
  })
})
