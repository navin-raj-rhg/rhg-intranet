import { useDb } from '~~/server/db/client'
import { deleteDashboardEvent, parseEventId } from '~~/server/utils/dashboardEvents'

// Owner only: remove an event.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  await deleteDashboardEvent(useDb(), parseEventId(event))
  return { ok: true }
})
