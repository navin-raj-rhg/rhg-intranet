import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { deleteProject, loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError } from '~~/server/utils/projects'

// Admins delete a project with all its tasks and comments.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const db = useDb()
  try {
    await deleteProject(db, await loadProjectAccess(db, parseProjectId(event), profile.id, roles))
    return { ok: true }
  } catch (err) {
    projectHttpError(err)
  }
})
