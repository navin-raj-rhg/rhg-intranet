import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_ROLES, COST_TOOL_ID } from '~~/server/utils/costFactors'
import { findOrCreateCostSubCategory } from '~~/server/utils/costCategories'
import { costNameProblem } from '~~/shared/utils/costCategories'

const bodySchema = z.object({ name: z.string() })

// Any Cost Modelling user can add a sub-category under an existing category.
// If it already exists there (ignoring case and spacing) that one is returned.
export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, COST_TOOL_ID, COST_ROLES)

  const categoryId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid category.' })
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  const problem = parsed.success ? costNameProblem(parsed.data.name, 'Sub-category') : 'Enter a sub-category name'
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })

  const result = await findOrCreateCostSubCategory(useDb(), profile.id, categoryId, parsed.data!.name)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'That category no longer exists.' })
  return result
})
