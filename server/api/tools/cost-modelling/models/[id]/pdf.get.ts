import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_ROLES, COST_TOOL_ID, isCostAdmin } from '~~/server/utils/costFactors'
import { getCostModel } from '~~/server/utils/costModels'
import { generateCostModelPdf } from '~~/server/utils/generateCostModelPdf'

// A saved cost model as a PDF. Everyone with the tool can open any model, so
// everyone with the tool can download any model's PDF.
export default defineEventHandler(async (event) => {
  const { roles } = await requireToolRole(event, COST_TOOL_ID, COST_ROLES)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid cost model.' })

  const model = await getCostModel(useDb(), id, isCostAdmin(roles))
  if (!model) throw createError({ statusCode: 404, statusMessage: 'That cost model no longer exists.' })

  const pdf = await generateCostModelPdf(model)

  const safeName = model.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || `cost-model-${id}`
  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
    'Cache-Control': 'no-store'
  })
  return pdf
})
