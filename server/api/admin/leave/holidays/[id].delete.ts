import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'
import { deletePublicHoliday } from '~~/server/utils/leaveHolidays'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

// Owner-only: remove a public holiday. Leave already applied for keeps the
// holidays it was made with.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  return deletePublicHoliday(useDb(), id)
})
