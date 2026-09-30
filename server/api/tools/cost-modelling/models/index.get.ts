import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_ROLES, COST_TOOL_ID } from '~~/server/utils/costFactors'
import { listCostModels } from '~~/server/utils/costModels'

// Everyone with the tool sees every saved model. ?q= searches, ?page= pages (25 per page).
export default defineEventHandler(async (event) => {
  await requireToolRole(event, COST_TOOL_ID, COST_ROLES)
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.slice(0, 100) : ''
  const page = Number(query.page) || 1
  return listCostModels(useDb(), q, page)
})
