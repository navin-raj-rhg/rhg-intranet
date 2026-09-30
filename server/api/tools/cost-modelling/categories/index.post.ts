import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_ROLES, COST_TOOL_ID } from '~~/server/utils/costFactors'
import { findOrCreateCostCategory } from '~~/server/utils/costCategories'
import { costNameProblem } from '~~/shared/utils/costCategories'

const bodySchema = z.object({ name: z.string() })

// Any Cost Modelling user can add a category. If it already exists (ignoring
// case and spacing) the existing one is returned with created: false.
export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, COST_TOOL_ID, COST_ROLES)
  const parsed = bodySchema.safeParse(await readBody(event))
  const problem = parsed.success ? costNameProblem(parsed.data.name, 'Category') : 'Enter a category name'
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })

  return findOrCreateCostCategory(useDb(), profile.id, parsed.data!.name)
})
