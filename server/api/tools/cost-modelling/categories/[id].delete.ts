import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_TOOL_ID } from '~~/server/utils/costFactors'
import { parseCostId, deleteCostCategory } from '~~/server/utils/costSetup'

// Admins only: delete a category that no saved model uses.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, COST_TOOL_ID, ['admin'])
  return deleteCostCategory(useDb(), parseCostId(event))
})
