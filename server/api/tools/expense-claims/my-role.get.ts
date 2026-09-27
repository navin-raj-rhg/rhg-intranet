import { requireToolRole } from '~~/server/utils/requireToolRole'

export default defineEventHandler(async (event) => {
  const { role } = await requireToolRole(event, 'expense-claims', ['employee', 'manager'])
  return { role }
})
