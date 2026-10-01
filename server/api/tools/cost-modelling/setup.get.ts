import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_TOOL_ID } from '~~/server/utils/costFactors'
import { loadCostSetup } from '~~/server/utils/costSetup'

// Admins (and the owner): every category, sub-category, port and charge line,
// including switched-off ones, with how many saved models use each.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, COST_TOOL_ID, ['admin'])
  return loadCostSetup(useDb())
})
