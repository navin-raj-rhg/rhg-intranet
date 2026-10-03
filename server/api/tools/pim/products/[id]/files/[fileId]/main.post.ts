import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { parsePimId, PIM_ROLES, PIM_TOOL_ID, pimHttpError, requirePimEditor, setPimMainImage } from '~~/server/utils/pim'

// Make an image the product's main image.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  requirePimEditor(roles)
  try {
    await setPimMainImage(useDb(), profile.id, parsePimId(event), parsePimId(event, 'fileId', 'file'))
    return { ok: true }
  } catch (err) {
    pimHttpError(err)
  }
})
