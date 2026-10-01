import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { LEAVE_TOOL_ID } from '~~/server/utils/leaveBalance'
import { listPublicHolidays } from '~~/server/utils/leaveHolidays'

const querySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional()
})

// Public holidays (date + name) for the team calendar and the dashboard.
// Open to everyone with a role on this tool.
export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  await requireToolRole(event, LEAVE_TOOL_ID, ['employee', 'manager'])

  const rows = await listPublicHolidays(useDb(), query)
  return rows.map(({ date, name }) => ({ date, name }))
})
