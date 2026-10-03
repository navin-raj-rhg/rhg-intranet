import { useDb } from '~~/server/db/client'
import { listAllDashboardEvents } from '~~/server/utils/dashboardEvents'

// Every event, past and future, for the owner's Manage events screen.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  return await listAllDashboardEvents(useDb())
})
