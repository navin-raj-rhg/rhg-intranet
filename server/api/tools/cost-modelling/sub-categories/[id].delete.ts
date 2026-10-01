import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_TOOL_ID } from '~~/server/utils/costFactors'
import { parseCostId, deleteCostSubCategory } from '~~/server/utils/costSetup'

// Admins only: delete a sub-category that no saved model uses.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, COST_TOOL_ID, ['admin'])
  return deleteCostSubCategory(useDb(), parseCostId(event))
})
