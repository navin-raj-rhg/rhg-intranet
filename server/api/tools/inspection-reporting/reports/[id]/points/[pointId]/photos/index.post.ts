import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import {
  INSPECTION_ROLES,
  INSPECTION_TOOL_ID,
  inspectionHttpError,
  parseInspectionId,
  registerInspectionPhoto
} from '~~/server/utils/inspections'

const bodySchema = z.object({
  key: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  contentType: z.string().max(100)
})

// Step 2 of adding a photo: after the browser has uploaded the file, record it
// on the point. The server checks the file really is in storage first.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const reportId = parseInspectionId(event)
  const pointId = parseInspectionId(event, 'inspection point', 'pointId')
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid photo.' })

  try {
    return await registerInspectionPhoto(useDb(), reportId, pointId, profile.id, roles, parsed.data)
  } catch (err) {
    inspectionHttpError(err)
  }
})
