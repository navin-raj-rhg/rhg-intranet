import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { inspectionReports } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { INSPECTION_ROLES, INSPECTION_TOOL_ID, inspectionPhotoUrls, parseInspectionId } from '~~/server/utils/inspections'

// View links (valid 15 minutes) for every photo in a report, keyed by photo id.
// Anyone with the tool can view any report, so any role may ask.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const id = parseInspectionId(event)
  const db = useDb()
  const [report] = await db.select({ id: inspectionReports.id }).from(inspectionReports).where(eq(inspectionReports.id, id))
  if (!report) throw createError({ statusCode: 404, statusMessage: 'That inspection report no longer exists.' })
  return inspectionPhotoUrls(db, id)
})
