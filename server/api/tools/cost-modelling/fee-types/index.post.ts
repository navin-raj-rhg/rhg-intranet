import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_TOOL_ID } from '~~/server/utils/costFactors'
import { addCostFeeType } from '~~/server/utils/costSetup'

// Admins only: add a local-cost charge line. It starts at 0 for every AU port.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, COST_TOOL_ID, ['admin'])
  const parsed = z.object({ name: z.string() }).safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Enter a name.' })
  return addCostFeeType(useDb(), parsed.data.name)
})
