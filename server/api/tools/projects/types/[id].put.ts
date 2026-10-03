import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, projectTypeBodySchema } from '~~/server/utils/projectBodies'
import { parseProjectId, PROJECTS_TOOL_ID, projectHttpError, updateProjectType } from '~~/server/utils/projects'

// Admins rename a project type or switch it off / on. Running projects keep the name they started with.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PROJECTS_TOOL_ID, ['admin'])
  const id = parseProjectId(event, 'id', 'project type')
  const parsed = projectTypeBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    return await updateProjectType(useDb(), id, parsed.data.name, parsed.data.active)
  } catch (err) {
    projectHttpError(err)
  }
})
