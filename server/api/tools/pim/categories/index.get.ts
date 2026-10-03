import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { listPimCategories, PIM_ROLES, PIM_TOOL_ID } from '~~/server/utils/pim'

// Every category with its sub-categories, attributes and product counts (switched-off ones included).
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  return await listPimCategories(useDb())
})
