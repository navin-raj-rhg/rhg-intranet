import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, newTaskBodySchema } from '~~/server/utils/projectBodies'
import { addProjectTask, loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError } from '~~/server/utils/projects'

// Any member adds a one-off task to the project, optionally waiting for other tasks.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const parsed = newTaskBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  const db = useDb()
  try {
    const access = await loadProjectAccess(db, parseProjectId(event), profile.id, roles)
    return await addProjectTask(db, access, {
      ...parsed.data,
      description: parsed.data.description ?? null,
      assigneeId: parsed.data.assigneeId ?? null
    })
  } catch (err) {
    projectHttpError(err)
  }
})
