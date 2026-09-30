import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'
import { listLeaveAdjustments } from '~~/server/utils/leaveAdmin'

const querySchema = z.object({ employeeId: z.string().uuid() })

// Owner-only. One person's adjustment history, newest first.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const { employeeId } = await getValidatedQuery(event, querySchema.parse)

  return listLeaveAdjustments(useDb(), employeeId)
})
