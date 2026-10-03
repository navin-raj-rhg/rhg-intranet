import { requireToolRole } from '~~/server/utils/requireToolRole'
import { canEditPim, isPimAdmin, PIM_ROLES, PIM_TOOL_ID } from '~~/server/utils/pim'

// Which buttons the Product Information screens show. The API enforces the same
// rules on every route; this is only for the screen.
export default defineEventHandler(async (event) => {
  const { roles } = await requireToolRole(event, PIM_TOOL_ID, PIM_ROLES)
  return { roles, canEdit: canEditPim(roles), isAdmin: isPimAdmin(roles) }
})
