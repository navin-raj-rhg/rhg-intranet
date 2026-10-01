import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'
import { listPublicHolidays } from '~~/server/utils/leaveHolidays'

// Owner-only: every public holiday, with ids, for the owner's holiday list.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  return listPublicHolidays(useDb())
})
