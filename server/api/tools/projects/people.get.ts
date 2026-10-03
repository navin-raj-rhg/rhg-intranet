import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { listProjectPeople, PROJECTS_ROLES, PROJECTS_TOOL_ID } from '~~/server/utils/projects'

// People who can be added to a project or given a task.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  return await listProjectPeople(useDb())
})
