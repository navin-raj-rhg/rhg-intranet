import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_ROLES, COST_TOOL_ID } from '~~/server/utils/costFactors'
import { listCostCategories } from '~~/server/utils/costCategories'

// The shared category list for the Cost Model dropdowns (everyone with the tool).
export default defineEventHandler(async (event) => {
  await requireToolRole(event, COST_TOOL_ID, COST_ROLES)
  return listCostCategories(useDb())
})
