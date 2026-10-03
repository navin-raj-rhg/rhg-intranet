import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError, taskFileDownloadUrl } from '~~/server/utils/projects'

// A short-lived link to open one attached file. Checks the caller belongs to the project first.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const db = useDb()
  try {
    const access = await loadProjectAccess(db, parseProjectId(event), profile.id, roles)
    return await taskFileDownloadUrl(db, access, parseProjectId(event, 'taskId', 'task'), parseProjectId(event, 'fileId', 'file'))
  } catch (err) {
    projectHttpError(err)
  }
})
