import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { isProjectsAdmin, listProjectTypes, PROJECTS_ROLES, PROJECTS_TOOL_ID } from '~~/server/utils/projects'

// Project types to pick from when starting a project (admins also see switched-off ones).
export default defineEventHandler(async (event) => {
  const { roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  return await listProjectTypes(useDb(), isProjectsAdmin(roles))
})
