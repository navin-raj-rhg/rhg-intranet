import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_ROLES, COST_TOOL_ID, isCostAdmin } from '~~/server/utils/costFactors'
import { getCostModel } from '~~/server/utils/costModels'

// Open one saved model: its inputs, the figures frozen at save time, and the
// Factors it was costed with. Everyone with the tool can open any model.
export default defineEventHandler(async (event) => {
  const { roles } = await requireToolRole(event, COST_TOOL_ID, COST_ROLES)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid cost model.' })

  const model = await getCostModel(useDb(), id, isCostAdmin(roles))
  if (!model) throw createError({ statusCode: 404, statusMessage: 'That cost model no longer exists.' })
  return model
})
