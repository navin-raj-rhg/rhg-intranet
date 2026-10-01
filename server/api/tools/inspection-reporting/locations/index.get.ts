import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { INSPECTION_ROLES, INSPECTION_TOOL_ID, listInspectionLocations } from '~~/server/utils/inspections'
import { isInspectionAdmin } from '~~/shared/utils/inspectionRules'

// Suppliers and DCs, A-Z within each type. Everyone sees the active ones;
// admins also get the switched-off ones so they can turn them back on.
export default defineEventHandler(async (event) => {
  const { roles } = await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  return listInspectionLocations(useDb(), isInspectionAdmin(roles))
})
