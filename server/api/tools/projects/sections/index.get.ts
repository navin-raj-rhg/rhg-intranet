import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { isProjectsAdmin, listProjectSections, PROJECTS_ROLES, PROJECTS_TOOL_ID } from '~~/server/utils/projects'

// Sections (Marketing, Quality...) in their set order. Admins also see switched-off ones.
export default defineEventHandler(async (event) => {
  const { roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  return await listProjectSections(useDb(), isProjectsAdmin(roles))
})
