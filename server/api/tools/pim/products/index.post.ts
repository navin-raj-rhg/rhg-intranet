import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem } from '~~/server/utils/projectBodies'
import { pimProductBodySchema } from '~~/server/utils/pimBodies'
import { createPimProduct, PIM_ROLES, PIM_TOOL_ID, pimHttpError, requirePimEditor } from '~~/server/utils/pim'

// Editors and admins create a product.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  requirePimEditor(roles)
  const parsed = pimProductBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  try {
    return await createPimProduct(useDb(), profile.id, parsed.data)
  } catch (err) {
    pimHttpError(err)
  }
})
