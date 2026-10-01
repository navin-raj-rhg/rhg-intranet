import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_TOOL_ID } from '~~/server/utils/costFactors'
import { parseCostId, mergeCostCategories } from '~~/server/utils/costSetup'

// Admins only: merge a category into another. Saved models are moved over; their names stay as saved.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, COST_TOOL_ID, ['admin'])
  const id = parseCostId(event)
  const parsed = z.object({ intoId: z.number().int().positive() }).safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Pick what to merge into.' })
  return mergeCostCategories(useDb(), id, parsed.data.intoId)
})
