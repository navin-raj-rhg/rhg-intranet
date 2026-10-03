import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, projectTypeBodySchema } from '~~/server/utils/projectBodies'
import { createProjectType, PROJECTS_TOOL_ID, projectHttpError } from '~~/server/utils/projects'

// Admins add a project type (it starts with no tasks ticked).
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PROJECTS_TOOL_ID, ['admin'])
  const parsed = projectTypeBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    return await createProjectType(useDb(), parsed.data.name, parsed.data.active)
  } catch (err) {
    projectHttpError(err)
  }
})
