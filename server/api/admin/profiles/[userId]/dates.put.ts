import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'
import { todayISO } from '~~/server/utils/leaveBalance'
import { updateProfileDates } from '~~/server/utils/leaveAdmin'

const paramsSchema = z.object({ userId: z.string().uuid() })

// Both keys are required (null = "not set"), so leaving one out can never
// clear it by accident.
const bodySchema = z.object({
  joinDate: z.string().date().nullable(),
  dateOfBirth: z.string().date().nullable()
})

// Owner-only. Sets a person's join date and date of birth. They drive years-of-
// service leave tiers and Birthday/Anniversary leave, so balances shift as soon
// as they change (nothing is stored per balance).
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const { userId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)

  return updateProfileDates(useDb(), { userId, ...body, today: todayISO() })
})
