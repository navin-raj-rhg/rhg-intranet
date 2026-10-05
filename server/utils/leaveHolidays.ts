import { and, asc, eq, gte, lte, ne, sql } from 'drizzle-orm'
import type { useDb } from '~~/server/db/client'
import { leaveHolidayYearsSynced, leavePublicHolidays } from '~~/server/db/schema'
import { autoHolidaysForYear } from '~~/shared/utils/autoHolidays'
import { formatDateMY, todayMY } from '~~/shared/utils/dates'
import { holidayNameProblem } from '~~/shared/utils/leaveRules'

type Db = ReturnType<typeof useDb>

/**
 * Fill in the Malaysian + Australian national holidays for this year and next, once per
 * year. A year is recorded as done, so a holiday the owner later removes or edits does not
 * come back, and a date the owner already has an entry for is left alone.
 */
async function syncAutoHolidays(db: Db) {
  const thisYear = Number(todayMY().slice(0, 4))
  const done = new Set((await db.select({ year: leaveHolidayYearsSynced.year }).from(leaveHolidayYearsSynced)).map(r => r.year))
  for (const year of [thisYear, thisYear + 1]) {
    if (done.has(year)) continue
    const rows = autoHolidaysForYear(year).map(h => ({ holidayDate: h.date, name: h.name }))
    if (rows.length) await db.insert(leavePublicHolidays).values(rows).onConflictDoNothing()
    await db.insert(leaveHolidayYearsSynced).values({ year }).onConflictDoNothing()
  }
}

let lastSyncDay = ''
let syncing: Promise<void> | null = null

/** Runs the sync at most once a day per server; a failure (e.g. table not migrated yet) never breaks the caller. */
async function ensureAutoHolidays(db: Db) {
  const today = todayMY()
  if (lastSyncDay === today) return
  syncing ??= syncAutoHolidays(db)
    .then(() => {
      lastSyncDay = today
    })
    .catch((err) => {
      console.error('Automatic public holidays could not be added:', err)
    })
    .finally(() => {
      syncing = null
    })
  await syncing
}

/** Public holidays (Step 13.8), optionally only those between two dates, in date order. */
export async function listPublicHolidays(db: Db, opts: { from?: string, to?: string } = {}) {
  await ensureAutoHolidays(db)
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
