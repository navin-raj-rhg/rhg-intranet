import { asc, eq, gte, or } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { useDb } from '~~/server/db/client'
import { dashboardEvents } from '~~/server/db/schema'
import { listPublicHolidays } from '~~/server/utils/leaveHolidays'
import { todayISO } from '~~/server/utils/leaveBalance'
import { eventProblem, pickUpcoming, type EventInput, type UpcomingItem } from '~~/shared/utils/eventRules'

type Db = ReturnType<typeof useDb>

const optionalText = z.string().nullable().optional()

export const eventBodySchema = z.object({
  title: z.string({ message: 'Give the event a title' }),
  date: z.string({ message: 'Choose a valid date' }),
  endDate: optionalText,
  time: optionalText,
  place: optionalText,
  note: optionalText
})

/** Blank boxes become null; text is trimmed. */
function tidy(body: z.infer<typeof eventBodySchema>): EventInput {
  const blank = (v: string | null | undefined) => (v?.trim() ? v.trim() : null)
  return {
    title: body.title.trim(),
    date: body.date.trim(),
    endDate: blank(body.endDate),
    time: blank(body.time),
    place: blank(body.place),
    note: blank(body.note)
  }
}

/** Checks the body and returns the cleaned event, or throws a plain 400. */
export function parseEventBody(raw: unknown): EventInput {
  const parsed = eventBodySchema.safeParse(raw)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'That request was not valid.' })
  }
  const input = tidy(parsed.data)
  const problem = eventProblem(input)
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })
  return input
}

export function parseEventId(event: H3Event): number {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid event.' })
  return id
}

/** The next events and public holidays for the dashboard widget. */
export async function listUpcomingEvents(db: Db): Promise<UpcomingItem[]> {
  const today = todayISO()
  const [events, holidays] = await Promise.all([
    db.select().from(dashboardEvents)
      .where(or(gte(dashboardEvents.date, today), gte(dashboardEvents.endDate, today)))
      .orderBy(asc(dashboardEvents.date)),
    listPublicHolidays(db, { from: today })
  ])
  const items: UpcomingItem[] = [
    ...events.map(e => ({
      key: `event-${e.id}`, kind: 'event' as const, title: e.title, date: e.date, endDate: e.endDate, time: e.time, place: e.place, note: e.note
    })),
    ...holidays.map(h => ({
      key: `holiday-${h.id}`, kind: 'holiday' as const, title: h.name, date: h.date, endDate: null, time: null, place: null, note: null
    }))
  ]
  return pickUpcoming(items, today)
}

/** Every event, newest date first, for the owner's Manage events screen. */
export function listAllDashboardEvents(db: Db) {
  return db.select().from(dashboardEvents).orderBy(asc(dashboardEvents.date), asc(dashboardEvents.id))
}

export async function addDashboardEvent(db: Db, userId: string, input: EventInput) {
  const [row] = await db.insert(dashboardEvents).values({ ...input, createdBy: userId }).returning({ id: dashboardEvents.id })
  return row!
}

export async function updateDashboardEvent(db: Db, id: number, input: EventInput) {
  const rows = await db.update(dashboardEvents).set(input).where(eq(dashboardEvents.id, id)).returning({ id: dashboardEvents.id })
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'That event no longer exists.' })
}

export async function deleteDashboardEvent(db: Db, id: number) {
  const rows = await db.delete(dashboardEvents).where(eq(dashboardEvents.id, id)).returning({ id: dashboardEvents.id })
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'That event no longer exists.' })
}
