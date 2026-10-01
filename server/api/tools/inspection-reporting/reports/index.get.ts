import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { INSPECTION_ROLES, INSPECTION_TOOL_ID, listInspectionReports } from '~~/server/utils/inspections'

// Everyone with the tool sees every report. ?q= searches, ?status=draft|in_review|closed
// filters, ?page= pages (25 per page).
export default defineEventHandler(async (event) => {
  await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.slice(0, 100) : ''
  const status = typeof query.status === 'string' ? query.status : ''
  return listInspectionReports(useDb(), q, status, Number(query.page) || 1)
})
