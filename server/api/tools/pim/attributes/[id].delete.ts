import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { deletePimAttribute, parsePimId, PIM_TOOL_ID, pimHttpError } from '~~/server/utils/pim'

// Admins delete an attribute no product has a value for (otherwise it is switched off).
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PIM_TOOL_ID, ['admin'])
  try {
    await deletePimAttribute(useDb(), parsePimId(event, 'id', 'attribute'))
    return { ok: true }
  } catch (err) {
    pimHttpError(err)
  }
})
