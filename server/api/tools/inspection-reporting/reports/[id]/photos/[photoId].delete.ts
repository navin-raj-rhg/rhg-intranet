import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import {
  deleteInspectionPhoto,
  INSPECTION_ROLES,
  INSPECTION_TOOL_ID,
  inspectionHttpError,
  parseInspectionId
} from '~~/server/utils/inspections'

// Remove a photo from a draft report (the inspector who started it, or an admin).
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const reportId = parseInspectionId(event)
  const photoId = parseInspectionId(event, 'photo', 'photoId')
  try {
    return await deleteInspectionPhoto(useDb(), reportId, photoId, profile.id, roles)
  } catch (err) {
    inspectionHttpError(err)
  }
})
