import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem } from '~~/server/utils/projectBodies'
import { pimCategoryUpdateSchema } from '~~/server/utils/pimBodies'
import { parsePimId, PIM_TOOL_ID, pimHttpError, updatePimCategory } from '~~/server/utils/pim'

// Admins rename a category, switch it on or off, and set the fields it requires.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PIM_TOOL_ID, ['admin'])
  const parsed = pimCategoryUpdateSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    await updatePimCategory(useDb(), parsePimId(event, 'id', 'category'), parsed.data)
    return { ok: true }
  } catch (err) {
    pimHttpError(err)
  }
})
