import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_ROLES, COST_TOOL_ID, isCostAdmin, loadCostFactors } from '~~/server/utils/costFactors'
import { factorsNotReadyReason } from '~~/shared/utils/costFactors'

// Everyone with the tool can view Factors (the Cost Model tab needs them too).
export default defineEventHandler(async (event) => {
  const { roles } = await requireToolRole(event, COST_TOOL_ID, COST_ROLES)
  const factors = await loadCostFactors(useDb())
  return {
    ...factors,
    canEdit: isCostAdmin(roles),
    notReadyReason: factorsNotReadyReason(factors)
  }
})
