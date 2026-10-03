import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { deletePimFile, parsePimId, PIM_ROLES, PIM_TOOL_ID, pimHttpError, requirePimEditor } from '~~/server/utils/pim'

// Remove an image or document (the stored file is deleted too, best effort).
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  requirePimEditor(roles)
  try {
    await deletePimFile(useDb(), profile.id, parsePimId(event), parsePimId(event, 'fileId', 'file'))
    return { ok: true }
  } catch (err) {
    pimHttpError(err)
  }
})
