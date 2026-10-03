import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, newTaskBodySchema } from '~~/server/utils/projectBodies'
import { loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError, updateProjectTask } from '~~/server/utils/projects'

// Any member edits a task: details, assignee, lead time, or the tasks it waits for.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const parsed = newTaskBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  const db = useDb()
  try {
    const access = await loadProjectAccess(db, parseProjectId(event), profile.id, roles)
    await updateProjectTask(db, access, parseProjectId(event, 'taskId', 'task'), {
      ...parsed.data,
      description: parsed.data.description ?? null,
      assigneeId: parsed.data.assigneeId ?? null
    })
    return { ok: true }
  } catch (err) {
    projectHttpError(err)
  }
})
