import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { exportPimCsv, PIM_ROLES, PIM_TOOL_ID, pimListFiltersFromQuery } from '~~/server/utils/pim'

// The products (all, or those matching the same filters as the list) as a CSV file.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  const { csv, fileName } = await exportPimCsv(useDb(), pimListFiltersFromQuery(getQuery(event)))
  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${fileName}"`)
  return csv
})
