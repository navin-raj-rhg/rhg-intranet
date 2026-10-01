import { requireToolRole } from '~~/server/utils/requireToolRole'
import { INSPECTION_ROLES, INSPECTION_TOOL_ID } from '~~/server/utils/inspections'
import { canCreateInspection, isInspectionAdmin } from '~~/shared/utils/inspectionRules'

// Which tabs/buttons the Inspection Reporting page shows. The API enforces the
// same rules on every route; this is only for the screen.
export default defineEventHandler(async (event) => {
  const { roles } = await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  return {
    roles,
    isAdmin: isInspectionAdmin(roles),
    canCreate: canCreateInspection(roles),
    isReviewer: roles.includes('reviewer') || roles.includes('owner')
  }
})
