import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { deletePimProduct, parsePimId, PIM_TOOL_ID, pimHttpError } from '~~/server/utils/pim'

// Admins delete a product, its history and its stored files.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PIM_TOOL_ID, ['admin'])
  try {
    await deletePimProduct(useDb(), parsePimId(event))
    return { ok: true }
  } catch (err) {
    pimHttpError(err)
  }
})
