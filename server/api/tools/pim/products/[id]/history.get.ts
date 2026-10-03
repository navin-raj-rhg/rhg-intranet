import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { listPimHistory, parsePimId, PIM_ROLES, PIM_TOOL_ID } from '~~/server/utils/pim'

// Who changed what, newest first.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  return await listPimHistory(useDb(), parsePimId(event))
})
