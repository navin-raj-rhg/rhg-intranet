import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { PROJECTS_ROLES, PROJECTS_TOOL_ID } from '~~/server/utils/projects'
import { loadProjectOverview } from '~~/server/utils/dashboardCharts'

// Figures for the Project overview tile, from the projects the caller can see (needs a Projects role).
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  return await loadProjectOverview(useDb(), profile.id, roles)
})
