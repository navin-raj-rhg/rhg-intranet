import { useDb } from '~~/server/db/client'
import { inspectionTemplates } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { INSPECTION_TOOL_ID, isUniqueViolation, tidyTemplateSections } from '~~/server/utils/inspections'
import { templateBodyProblem, templateBodySchema } from '~~/server/utils/inspectionTemplateBody'

// Admins create a report template from the form builder.
export default defineEventHandler(async (event) => {
  const { profile } = await requireToolRole(event, INSPECTION_TOOL_ID, ['admin'])
  const parsed = templateBodySchema.safeParse(await readBody(event))
  const problem = templateBodyProblem(parsed)
  if (problem || !parsed.success) throw createError({ statusCode: 400, statusMessage: problem || 'Invalid template.' })

  const name = parsed.data.name.replace(/\s+/g, ' ').trim()
  try {
    const [row] = await useDb()
      .insert(inspectionTemplates)
      .values({ name, sections: tidyTemplateSections(parsed.data.sections), active: parsed.data.active, createdBy: profile.id })
      .returning({ id: inspectionTemplates.id })
    return row
  } catch (err) {
    if (isUniqueViolation(err)) throw createError({ statusCode: 409, statusMessage: `There is already a template called "${name}".` })
    throw err
  }
})
