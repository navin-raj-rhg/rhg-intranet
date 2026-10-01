import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'
import { addPublicHoliday } from '~~/server/utils/leaveHolidays'

const bodySchema = z.object({ date: z.string().date(), name: z.string() })

// Owner-only: add a public holiday. Leave already applied for is not changed;
// only applications made from now on skip it.
export default defineEventHandler(async (event) => {
  const owner = await requireOwner(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Enter a valid date and a name.' })
  return addPublicHoliday(useDb(), owner.id, parsed.data)
})
