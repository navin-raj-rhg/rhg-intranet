import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_ROLES, COST_TOOL_ID } from '~~/server/utils/costFactors'
import { findCostProducts } from '~~/server/utils/costModels'

// Product look-up for the Cost Model form: previously costed products whose
// product no. contains ?q=, most recent version of each (everyone with the tool).
export default defineEventHandler(async (event) => {
  await requireToolRole(event, COST_TOOL_ID, COST_ROLES)
  const q = getQuery(event).q
  return findCostProducts(useDb(), typeof q === 'string' ? q.slice(0, 100) : '')
})
