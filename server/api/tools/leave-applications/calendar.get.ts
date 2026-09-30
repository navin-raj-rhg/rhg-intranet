import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { LEAVE_TOOL_ID } from '~~/server/utils/leaveBalance'
import { listCalendarLeave } from '~~/server/utils/leaveRequest'
import { addDaysISO } from '~~/shared/utils/leaveRules'

const MAX_RANGE_DAYS = 100 // enough for a month view with the neighbouring weeks

const querySchema = z.object({
  from: z.string().date(),
  to: z.string().date()
}).refine(q => q.to >= q.from, { message: 'to must not be before from' })
  .refine(q => q.to <= addDaysISO(q.from, MAX_RANGE_DAYS), { message: `Range is limited to ${MAX_RANGE_DAYS} days` })

// Who is away between two dates: approved leave only, and never the leave type,
// reason or anything else about it. Open to everyone with a role on this tool
// (employees, managers, owner) so people can see when colleagues are out.
export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  await requireToolRole(event, LEAVE_TOOL_ID, ['employee', 'manager'])

  return listCalendarLeave(useDb(), query)
})
