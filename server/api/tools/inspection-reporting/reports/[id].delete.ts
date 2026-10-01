import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { inspectionReports } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { INSPECTION_TOOL_ID, parseInspectionId } from '~~/server/utils/inspections'

// Only admins (and the owner) delete a report, in any status. Its points,
// photo records and history go with it (the photo files in R2 are left, as
// with expense receipts - a Step 13 clean-up item).
export default defineEventHandler(async (event) => {
  await requireToolRole(event, INSPECTION_TOOL_ID, ['admin'])
  const deleted = await useDb()
    .delete(inspectionReports)
    .where(eq(inspectionReports.id, parseInspectionId(event)))
    .returning({ id: inspectionReports.id })
  if (!deleted[0]) throw createError({ statusCode: 404, statusMessage: 'That inspection report no longer exists.' })
  return deleted[0]
})
