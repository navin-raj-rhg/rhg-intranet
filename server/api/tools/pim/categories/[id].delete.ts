import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { deletePimCategory, parsePimId, PIM_TOOL_ID, pimHttpError } from '~~/server/utils/pim'

// Admins delete a category that no product uses (a used one is switched off instead).
export default defineEventHandler(async (event) => {
  await requireToolRole(event, PIM_TOOL_ID, ['admin'])
  try {
    await deletePimCategory(useDb(), parsePimId(event, 'id', 'category'))
    return { ok: true }
  } catch (err) {
    pimHttpError(err)
  }
})
