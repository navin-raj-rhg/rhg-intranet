import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_TOOL_ID } from '~~/server/utils/costFactors'
import { addCostPort } from '~~/server/utils/costSetup'

// Admins only: add a ship-from or AU port. Freight and local costs start at 0;
// fill them in on the Factors tab.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, COST_TOOL_ID, ['admin'])
  const parsed = z.object({
    kind: z.enum(['origin', 'destination']),
    code: z.string(),
    name: z.string()
  }).safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Enter the port type, code and name.' })
  return addCostPort(useDb(), parsed.data)
})
