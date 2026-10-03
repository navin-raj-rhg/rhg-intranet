import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { listPimProducts, PIM_ROLES, PIM_TOOL_ID, pimListFiltersFromQuery } from '~~/server/utils/pim'

// One page (50) of products, A-Z by product number. Filters: q, status, categoryId, subCategoryId, page.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  return await listPimProducts(useDb(), pimListFiltersFromQuery(getQuery(event)))
})
