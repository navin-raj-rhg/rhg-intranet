import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem } from '~~/server/utils/projectBodies'
import { pimCategoryCreateSchema } from '~~/server/utils/pimBodies'
import { createPimCategory, PIM_TOOL_ID, pimHttpError } from '~~/server/utils/pim'

// Admins add a category, or a sub-category when `parentId` is given.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PIM_TOOL_ID, ['admin'])
  const parsed = pimCategoryCreateSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    return await createPimCategory(useDb(), parsed.data.name, parsed.data.parentId)
  } catch (err) {
    pimHttpError(err)
  }
})
