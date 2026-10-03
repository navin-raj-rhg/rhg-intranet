import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, projectTemplateBodySchema } from '~~/server/utils/projectBodies'
import { PROJECTS_TOOL_ID, projectHttpError, saveProjectTemplate } from '~~/server/utils/projects'

// Admins save the whole master task list in one go. Projects already started
// keep their own copy of their tasks, so this only affects projects started afterwards.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PROJECTS_TOOL_ID, ['admin'])
  const parsed = projectTemplateBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    await saveProjectTemplate(useDb(), parsed.data.tasks.map(t => ({
      ...t,
      description: t.description ?? null,
      sectionId: t.sectionId ?? null,
      assigneeId: t.assigneeId ?? null
    })))
    return { ok: true }
  } catch (err) {
    projectHttpError(err)
  }
})
