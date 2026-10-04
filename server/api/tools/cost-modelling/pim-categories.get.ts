import { asc, eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { pimCategories } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { COST_ROLES, COST_TOOL_ID } from '~~/server/utils/costFactors'
import type { PimCategoryName } from '~~/shared/types/costModelling'

// The PIM's categories (names only, switched-off ones left out) so the Cost Model
// form can offer them next to its own (Step 20.4). Needs only a Cost Modelling role.
export default defineEventHandler(async (event): Promise<PimCategoryName[]> => {
  await requireToolRole(event, COST_TOOL_ID, COST_ROLES)
  const rows = await useDb()
    .select({ id: pimCategories.id, parentId: pimCategories.parentId, name: pimCategories.name })
    .from(pimCategories)
    .where(eq(pimCategories.active, true))
    .orderBy(asc(pimCategories.name))
  return rows
    .filter(c => c.parentId === null)
    .map(c => ({ name: c.name, subCategories: rows.filter(s => s.parentId === c.id).map(s => s.name) }))
})
