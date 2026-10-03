import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem } from '~~/server/utils/projectBodies'
import { pimAttributeCreateSchema } from '~~/server/utils/pimBodies'
import { createPimAttribute, PIM_TOOL_ID, pimHttpError } from '~~/server/utils/pim'

// Admins add an attribute (an extra field) to a category.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PIM_TOOL_ID, ['admin'])
  const parsed = pimAttributeCreateSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    return await createPimAttribute(useDb(), parsed.data)
  } catch (err) {
    pimHttpError(err)
  }
})
