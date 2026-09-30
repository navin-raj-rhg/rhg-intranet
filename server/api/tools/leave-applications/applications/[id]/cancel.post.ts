import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { LEAVE_TOOL_ID, todayISO } from '~~/server/utils/leaveBalance'
import { cancelLeaveApplication } from '~~/server/utils/leaveRequest'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// Applicant cancels their own leave: while pending, or once approved but only
// until it starts. The rules are in cancelLeaveApplication().
export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, LEAVE_TOOL_ID, ['employee'])
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  return cancelLeaveApplication(useDb(), {
    id,
    employeeId: profile.id,
    today: todayISO()
  })
})
