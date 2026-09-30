import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_ROLES, COST_TOOL_ID, isCostAdmin } from '~~/server/utils/costFactors'

// Which tabs/buttons the Cost Modelling page shows. The API enforces the same
// rules on every route; this is only for the screen.
export default defineEventHandler(async (event) => {
  const { roles } = await requireToolRole(event, COST_TOOL_ID, COST_ROLES)
  return { roles, isAdmin: isCostAdmin(roles) }
})
