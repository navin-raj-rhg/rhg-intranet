import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { listMyProjectTasks, PROJECTS_ROLES, PROJECTS_TOOL_ID } from '~~/server/utils/projects'

// Tasks assigned to the caller that are ready to work on (not blocked, not done).
export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  return await listMyProjectTasks(useDb(), profile.id)
})
