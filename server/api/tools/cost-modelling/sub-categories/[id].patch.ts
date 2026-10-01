import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_TOOL_ID } from '~~/server/utils/costFactors'
import { parseCostId, renameCostSubCategory } from '~~/server/utils/costSetup'

// Admins only: rename a sub-category.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, COST_TOOL_ID, ['admin'])
  const id = parseCostId(event)
  const parsed = z.object({ name: z.string() }).safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Enter a name.' })
  return renameCostSubCategory(useDb(), id, parsed.data.name)
})
