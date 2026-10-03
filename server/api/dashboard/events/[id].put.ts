import { useDb } from '~~/server/db/client'
import { parseEventBody, parseEventId, updateDashboardEvent } from '~~/server/utils/dashboardEvents'

// Owner only: change an event.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  await updateDashboardEvent(useDb(), parseEventId(event), parseEventBody(await readBody(event)))
  return { ok: true }
})
