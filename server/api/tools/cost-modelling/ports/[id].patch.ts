import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_TOOL_ID } from '~~/server/utils/costFactors'
import { parseCostId, updateCostPort } from '~~/server/utils/costSetup'

// Admins only: rename a port, or switch it off / on. Ports are never deleted
// because saved models mention them; switched-off ports just stop being offered.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, COST_TOOL_ID, ['admin'])
  const id = parseCostId(event)
  const parsed = z.object({ name: z.string().optional(), active: z.boolean().optional() }).safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid change.' })
  return updateCostPort(useDb(), id, parsed.data)
})
