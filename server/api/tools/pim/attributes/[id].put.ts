import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem } from '~~/server/utils/projectBodies'
import { pimAttributeUpdateSchema } from '~~/server/utils/pimBodies'
import { parsePimId, PIM_TOOL_ID, pimHttpError, updatePimAttribute } from '~~/server/utils/pim'

// Admins rename an attribute, change its choices, make it required, or switch it off.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PIM_TOOL_ID, ['admin'])
  const parsed = pimAttributeUpdateSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    await updatePimAttribute(useDb(), parsePimId(event, 'id', 'attribute'), parsed.data)
    return { ok: true }
  } catch (err) {
    pimHttpError(err)
  }
})
