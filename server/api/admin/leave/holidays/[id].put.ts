import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'
import { updatePublicHoliday } from '~~/server/utils/leaveHolidays'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })
const bodySchema = z.object({ date: z.string().date(), name: z.string() })

// Owner-only: change a holiday's date or name. Leave already applied for keeps
// the holidays it was made with.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Enter a valid date and a name.' })
  return updatePublicHoliday(useDb(), id, parsed.data)
})
