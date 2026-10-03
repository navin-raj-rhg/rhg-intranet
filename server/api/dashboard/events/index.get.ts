import { useDb } from '~~/server/db/client'
import { listUpcomingEvents } from '~~/server/utils/dashboardEvents'

// The next few events and public holidays, for the dashboard. Anyone signed in.
export default defineEventHandler(async (event) => {
  await requireProfile(event)
  return await listUpcomingEvents(useDb())
})
