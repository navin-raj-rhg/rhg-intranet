import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { getInspectionReport, INSPECTION_ROLES, INSPECTION_TOOL_ID, parseInspectionId } from '~~/server/utils/inspections'

// Open one report: header, every point with its answer and photos, the
// calculated result, the history, and what this user is allowed to do with it.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const report = await getInspectionReport(useDb(), parseInspectionId(event), profile.id, roles)
  if (!report) throw createError({ statusCode: 404, statusMessage: 'That inspection report no longer exists.' })
  return report
})
