import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { useDb } from '~~/server/db/client'
import { leaveApplications, leaveTypes, profiles } from '~~/server/db/schema'
import {
  balanceInputFor,
  loadLeaveContext,
  type LeaveTypeRow
} from '~~/server/utils/leaveBalance'
import { listPublicHolidays } from '~~/server/utils/leaveHolidays'
import { formatDateMY } from '~~/shared/utils/dates'
import {
  canCancelLeave,
  checkDateRestriction,
  checkRequestAgainstBalance,
  countLeaveDays,
  findLeaveConflict,
  holidaysOnWorkdays,
  validateLeaveDates,
  type CycleBalanceCheck,
  type ISODate,
  type LeaveStatus,
  type PublicHoliday
} from '~~/shared/utils/leaveRules'

/**
 * Applying for, listing and cancelling leave (Step 10.6). Like leaveBalance.ts
 * these take `db` as an argument, hold no rules of their own (those live in
 * shared/utils/leaveRules.ts) and can be tested against a plain Postgres.
 *
 * Error messages go into the HTTP status line, so they must stay plain ASCII.
 */

type Db = ReturnType<typeof useDb>

export interface LeaveRequestInput {
  leaveTypeId: number
  startDate: ISODate
  endDate: ISODate
  startHalfDay: boolean
  endHalfDay: boolean
}

export type LeaveEvaluation
  = | {
    ok: true
    type: LeaveTypeRow
    days: number
    /** Public holidays inside the dates that are skipped (not counted as leave). */
    holidaysSkipped: PublicHoliday[]
    /** One entry per leave cycle the request touches; `exceeds` = over balance (advisory only). */
    balanceChecks: CycleBalanceCheck[]
  }
  | { ok: false, status: 400 | 409, message: string }

const fail = (status: 400 | 409, message: string): LeaveEvaluation => ({ ok: false, status, message })

/**
 * Every check for a new request, in one place, so "preview" and "submit" can
 * never disagree: leave type is active, dates make sense, the birth/join-month
 * rule, no clash with the person's other leave, and (advisory) their balance.
 * Nothing is written.
 */
export async function evaluateLeaveRequest(
  db: Db,
  employeeId: string,
  input: LeaveRequestInput
): Promise<LeaveEvaluation> {
  const ctx = await loadLeaveContext(db, employeeId)

  const type = ctx.types.find(t => t.id === input.leaveTypeId)
  if (!type) return fail(400, 'Unknown or inactive leave type.')

  // Public holidays inside the dates are skipped like weekends (and kept on the application).
  const holidaysSkipped = holidaysOnWorkdays(
    input.startDate,
    input.endDate,
    await listPublicHolidays(db, { from: input.startDate, to: input.endDate })
  )
  const range = {
    startDate: input.startDate,
    endDate: input.endDate,
    startHalfDay: input.startHalfDay,
    endHalfDay: input.endHalfDay,
    holidays: holidaysSkipped.map(h => h.date)
  }

  const dateError = validateLeaveDates(range)
  if (dateError) return fail(400, dateError)

  const restriction = checkDateRestriction(type.dateRestriction, range, ctx.profile)
  if (!restriction.ok) return fail(400, restriction.reason)

  const clash = findLeaveConflict([...ctx.applications.values()].flat(), range)
  if (clash) {
    return fail(409, `You already have leave on ${formatDateMY(clash)}. Cancel it first or choose different dates.`)
  }

  return {
    ok: true,
    type,
    days: countLeaveDays(range),
    holidaysSkipped,
    balanceChecks: checkRequestAgainstBalance(balanceInputFor(ctx, type), range)
  }
}

/**
 * Cancels the applicant's own application. The UPDATE re-checks the status it
 * just read, so if a manager approves at the same moment, exactly one of the
 * two actions wins and the other gets a clear 409.
 */
export async function cancelLeaveApplication(
  db: Db,
  opts: { id: number, employeeId: string, today: ISODate }
) {
  const app = await db.query.leaveApplications.findFirst({
    where: (a, { eq }) => eq(a.id, opts.id)
  })
  // Someone else's application looks exactly like one that doesn't exist.
  if (!app || app.employeeId !== opts.employeeId) {
    throw createError({ statusCode: 404, statusMessage: 'Leave application not found' })
  }

  if (!canCancelLeave(app.status, app.startDate, opts.today)) {
    const message = app.status === 'cancelled'
      ? 'This application is already cancelled.'
      : app.status === 'rejected'
        ? 'A rejected application cannot be cancelled.'
        : 'Leave that has already started cannot be cancelled.'
    throw createError({ statusCode: 409, statusMessage: message })
  }

  const [updated] = await db
    .update(leaveApplications)
    .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(leaveApplications.id, opts.id),
      eq(leaveApplications.employeeId, opts.employeeId),
      eq(leaveApplications.status, app.status)
    ))
    .returning()

  if (!updated) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This application was just changed by someone else. Refresh and try again.'
    })
  }
  return updated
}

/**
 * Applications for the given employees ('all' = everyone, owner only), newest
 * first. Used for "my leave" and for a manager's team list.
 */
export async function listLeaveApplications(
  db: Db,
  opts: { employeeIds: string[] | 'all', status?: LeaveStatus }
) {
  const conditions = []
  if (opts.employeeIds !== 'all') {
    if (opts.employeeIds.length === 0) return []
    conditions.push(inArray(leaveApplications.employeeId, opts.employeeIds))
  }
  if (opts.status) conditions.push(eq(leaveApplications.status, opts.status))

  const rows = await db
    .select({
      application: leaveApplications,
      leaveTypeName: leaveTypes.name,
      employeeName: profiles.fullName,
      employeeEmail: profiles.email
    })
    .from(leaveApplications)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
    .leftJoin(profiles, eq(profiles.id, leaveApplications.employeeId))
    .where(and(...conditions))
    .orderBy(desc(leaveApplications.startDate), desc(leaveApplications.id))

  return rows.map(r => ({
    ...r.application,
    leaveTypeName: r.leaveTypeName,
    employeeName: r.employeeName,
    employeeEmail: r.employeeEmail
  }))
}

/** One application with the names the detail view shows, or null. */
export async function getLeaveApplicationDetail(db: Db, id: number) {
  const decider = alias(profiles, 'decider')
  const [row] = await db
    .select({
      application: leaveApplications,
      leaveTypeName: leaveTypes.name,
      employeeName: profiles.fullName,
      employeeEmail: profiles.email,
      deciderName: decider.fullName
    })
    .from(leaveApplications)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveApplications.leaveTypeId))
    .leftJoin(profiles, eq(profiles.id, leaveApplications.employeeId))
    .leftJoin(decider, eq(decider.id, leaveApplications.decidedBy))
    .where(eq(leaveApplications.id, id))
  if (!row) return null

  return {
    ...row.application,
    leaveTypeName: row.leaveTypeName,
    employeeName: row.employeeName,
    employeeEmail: row.employeeEmail,
    deciderName: row.deciderName
  }
}

/**
 * What approving a PENDING application would do to the employee's balance,
 * with the application itself left out of "already used" (it is pending, so it
 * is otherwise counted twice). Null if it isn't pending or its type has been
 * retired. Advisory: the manager decides.
 */
export async function getLeaveBalanceImpact(
  db: Db,
  application: LeaveRequestInput & { id: number, employeeId: string, status: LeaveStatus }
): Promise<CycleBalanceCheck[] | null> {
  if (application.status !== 'pending') return null
  const ctx = await loadLeaveContext(db, application.employeeId)
  const type = ctx.types.find(t => t.id === application.leaveTypeId)
  if (!type) return null

  const input = balanceInputFor(ctx, type)
  return checkRequestAgainstBalance(
    { ...input, applications: input.applications.filter(a => a.id !== application.id) },
    application
  )
}

const ALREADY_MESSAGE: Record<LeaveStatus, string> = {
  pending: '',
  approved: 'This application has already been approved.',
  rejected: 'This application has already been rejected.',
  cancelled: 'The applicant has cancelled this application.'
}

/**
 * A manager approves or rejects a PENDING application. Rules, in order:
 * it exists; you are not deciding your own leave (nobody may, the owner
 * included); `canDecideFor` says the applicant is on your team (or you are the
 * owner); it is still pending. The UPDATE re-checks "still pending", so two
 * managers clicking at once, or a manager racing the applicant's cancel, give
 * exactly one winner, and the loser gets a clear 409.
 */
export async function decideLeaveApplication(
  db: Db,
  opts: {
    id: number
    deciderId: string
    decision: 'approved' | 'rejected'
    note?: string | null
    canDecideFor: (employeeId: string) => Promise<boolean>
  }
) {
  const app = await db.query.leaveApplications.findFirst({
    where: (a, { eq }) => eq(a.id, opts.id)
  })
  if (!app) {
    throw createError({ statusCode: 404, statusMessage: 'Leave application not found' })
  }
  if (app.employeeId === opts.deciderId) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot approve or reject your own leave.' })
  }
  if (!(await opts.canDecideFor(app.employeeId))) {
    throw createError({ statusCode: 403, statusMessage: 'This employee is not on your team' })
  }
  if (app.status !== 'pending') {
    throw createError({ statusCode: 409, statusMessage: ALREADY_MESSAGE[app.status] })
  }

  const [updated] = await db
    .update(leaveApplications)
    .set({
      status: opts.decision,
      decidedBy: opts.deciderId,
      decidedAt: new Date(),
      decisionNote: opts.note?.trim() || null,
      updatedAt: new Date()
    })
    .where(and(eq(leaveApplications.id, opts.id), eq(leaveApplications.status, 'pending')))
    .returning()

  if (!updated) {
    // Lost a race. Say what actually happened.
    const now = await db.query.leaveApplications.findFirst({
      where: (a, { eq }) => eq(a.id, opts.id)
    })
    throw createError({
      statusCode: 409,
      statusMessage: now && now.status !== 'pending'
        ? `${ALREADY_MESSAGE[now.status]} (just now)`
        : 'This application was just changed. Refresh and try again.'
    })
  }
  return updated
}

/**
 * Team calendar: who is away, and when. APPROVED leave only, and deliberately
 * nothing else: no leave type, reason, attachment or status. Anyone with a
 * role on the tool may see it, so this is what the whole company can know.
 */
export async function listCalendarLeave(db: Db, opts: { from: ISODate, to: ISODate }) {
  const rows = await db
    .select({
      employeeId: leaveApplications.employeeId,
      employeeName: profiles.fullName,
      employeeEmail: profiles.email,
      startDate: leaveApplications.startDate,
      endDate: leaveApplications.endDate,
      startHalfDay: leaveApplications.startHalfDay,
      endHalfDay: leaveApplications.endHalfDay,
      holidays: leaveApplications.holidayDates
    })
    .from(leaveApplications)
    .leftJoin(profiles, eq(profiles.id, leaveApplications.employeeId))
    .where(and(
      eq(leaveApplications.status, 'approved'),
      lte(leaveApplications.startDate, opts.to),
      gte(leaveApplications.endDate, opts.from)
    ))
    .orderBy(asc(leaveApplications.startDate), asc(leaveApplications.id))

  return rows.map(r => ({
    employeeId: r.employeeId,
    employeeName: r.employeeName || r.employeeEmail || 'Unknown',
    startDate: r.startDate,
    endDate: r.endDate,
    startHalfDay: r.startHalfDay,
    endHalfDay: r.endHalfDay,
    holidays: r.holidays
  }))
}
