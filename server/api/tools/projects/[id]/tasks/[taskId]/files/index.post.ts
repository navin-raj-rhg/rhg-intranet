import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, fileRegisterBodySchema } from '~~/server/utils/projectBodies'
import { loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError, registerTaskFile } from '~~/server/utils/projects'

// Step 3 of attaching a file: after the browser has uploaded it, the server
// checks the file really arrived at an allowed size and records it on the task.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const parsed = fileRegisterBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  const db = useDb()
  try {
    const access = await loadProjectAccess(db, parseProjectId(event), profile.id, roles)
    return await registerTaskFile(db, access, profile.id, parseProjectId(event, 'taskId', 'task'), parsed.data)
  } catch (err) {
    projectHttpError(err)
  }
})
