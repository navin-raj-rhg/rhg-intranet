import { useDb } from '~~/server/db/client'
import { addDashboardEvent, parseEventBody } from '~~/server/utils/dashboardEvents'

// Owner only: add an event.
export default defineEventHandler(async (event) => {
  const profile = await requireOwner(event)
  return await addDashboardEvent(useDb(), profile.id, parseEventBody(await readBody(event)))
})
