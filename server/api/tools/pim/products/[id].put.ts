import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem } from '~~/server/utils/projectBodies'
import { pimProductBodySchema } from '~~/server/utils/pimBodies'
import { parsePimId, PIM_ROLES, PIM_TOOL_ID, pimHttpError, requirePimEditor, updatePimProduct } from '~~/server/utils/pim'

// Editors and admins save a product (the whole record; the change history notes what differed).
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  requirePimEditor(roles)
  const parsed = pimProductBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    return await updatePimProduct(useDb(), profile.id, parsePimId(event), parsed.data)
  } catch (err) {
    pimHttpError(err)
  }
})
