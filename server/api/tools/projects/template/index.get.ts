import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { loadProjectTemplate, PROJECTS_TOOL_ID } from '~~/server/utils/projects'

// The master task list and project types, for the admin screen.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PROJECTS_TOOL_ID, ['admin'])
  return await loadProjectTemplate(useDb())
})
