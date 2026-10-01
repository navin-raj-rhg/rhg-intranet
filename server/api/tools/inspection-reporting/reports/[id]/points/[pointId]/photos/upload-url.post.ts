import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import {
  createInspectionPhotoUpload,
  INSPECTION_ROLES,
  INSPECTION_TOOL_ID,
  inspectionHttpError,
  parseInspectionId
} from '~~/server/utils/inspections'

const bodySchema = z.object({
  fileName: z.string({ message: 'Choose a photo' }).min(1, 'Choose a photo').max(255),
  contentType: z.string().max(100),
  sizeBytes: z.number({ message: 'Choose a photo' }).int()
})

// Step 1 of adding a photo: the browser says what it wants to upload; if it is
// an allowed image, within the size limit, on a draft the user may edit, it
// gets a short-lived link that accepts a file of exactly that size.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const reportId = parseInspectionId(event)
  const pointId = parseInspectionId(event, 'inspection point', 'pointId')
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid photo.' })

  try {
    return await createInspectionPhotoUpload(useDb(), reportId, pointId, profile.id, roles, parsed.data)
  } catch (err) {
    inspectionHttpError(err)
  }
})
