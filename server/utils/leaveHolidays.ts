import { and, asc, eq, gte, lte, ne, sql } from 'drizzle-orm'
import type { useDb } from '~~/server/db/client'
import { leavePublicHolidays } from '~~/server/db/schema'
import { formatDateMY } from '~~/shared/utils/dates'
import { holidayNameProblem } from '~~/shared/utils/leaveRules'

type Db = ReturnType<typeof useDb>

/** Public holidays (Step 13.8), optionally only those between two dates, in date order. */
export async function listPublicHolidays(db: Db, opts: { from?: string, to?: string } = {}) {
  const conditions = []
  if (opts.from) conditions.push(gte(leavePublicHolidays.holidayDate, opts.from))
  if (opts.to) conditions.push(lte(leavePublicHolidays.holidayDate, opts.to))

  const rows = await db
    .select({ id: leavePublicHolidays.id, date: leavePublicHolidays.holidayDate, name: leavePublicHolidays.name })
    .from(leavePublicHolidays)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(leavePublicHolidays.holidayDate))
  return rows
}

function tidyName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

async function failIfDateTaken(db: Db, date: string, exceptId?: number) {
  const [clash] = await db
    .select({ id: leavePublicHolidays.id, name: leavePublicHolidays.name })
    .from(leavePublicHolidays)
    .where(and(
      eq(leavePublicHolidays.holidayDate, date),
      exceptId ? ne(leavePublicHolidays.id, exceptId) : sql`true`
    ))
  if (clash) {
    throw createError({
      statusCode: 409,
      statusMessage: `There is already a holiday on ${formatDateMY(date)} (${clash.name}).`
    })
  }
}

export async function addPublicHoliday(db: Db, userId: string, input: { date: string, name: string }) {
  const problem = holidayNameProblem(input.name)
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })
  await failIfDateTaken(db, input.date)

  const [row] = await db
    .insert(leavePublicHolidays)
    .values({ holidayDate: input.date, name: tidyName(input.name), createdBy: userId })
    .returning({ id: leavePublicHolidays.id, date: leavePublicHolidays.holidayDate, name: leavePublicHolidays.name })
  return row
}

export async function updatePublicHoliday(db: Db, id: number, input: { date: string, name: string }) {
  const problem = holidayNameProblem(input.name)
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })
  await failIfDateTaken(db, input.date, id)

  const [row] = await db
    .update(leavePublicHolidays)
    .set({ holidayDate: input.date, name: tidyName(input.name) })
    .where(eq(leavePublicHolidays.id, id))
    .returning({ id: leavePublicHolidays.id, date: leavePublicHolidays.holidayDate, name: leavePublicHolidays.name })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'That holiday no longer exists.' })
  return row
}

export async function deletePublicHoliday(db: Db, id: number) {
  const [row] = await db
    .delete(leavePublicHolidays)
    .where(eq(leavePublicHolidays.id, id))
    .returning({ id: leavePublicHolidays.id, name: leavePublicHolidays.name })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'That holiday no longer exists.' })
  return row
}
