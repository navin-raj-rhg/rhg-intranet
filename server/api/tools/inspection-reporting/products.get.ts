import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { findInspectionProducts, INSPECTION_ROLES, INSPECTION_TOOL_ID } from '~~/server/utils/inspections'

// Product look-up: products saved by earlier inspections whose number contains
// ?q= (numbers starting with it first). Anyone with the tool can search.
export default defineEventHandler(async (event) => {
  await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const q = getQuery(event).q
  return findInspectionProducts(useDb(), typeof q === 'string' ? q.slice(0, 100) : '')
})
