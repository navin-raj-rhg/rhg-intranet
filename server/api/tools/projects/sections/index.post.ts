import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, projectSectionBodySchema } from '~~/server/utils/projectBodies'
import { createProjectSection, PROJECTS_TOOL_ID, projectHttpError } from '~~/server/utils/projects'

// Admins add a section; it goes to the end of the list.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PROJECTS_TOOL_ID, ['admin'])
  const parsed = projectSectionBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    return await createProjectSection(useDb(), parsed.data.name, parsed.data.active)
  } catch (err) {
    projectHttpError(err)
  }
})
