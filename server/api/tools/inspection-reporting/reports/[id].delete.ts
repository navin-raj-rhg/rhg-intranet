import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { deleteInspectionReport, INSPECTION_ROLES, INSPECTION_TOOL_ID, inspectionHttpError, parseInspectionId } from '~~/server/utils/inspections'

// An inspector can discard their own draft; admins (and the owner) can delete a
// report in any status. Points, photo records and history go with it, and the
// photo files in R2 are removed too (best effort).
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  try {
    return await deleteInspectionReport(useDb(), parseInspectionId(event), profile.id, roles)
  } catch (err) {
    inspectionHttpError(err)
  }
})
