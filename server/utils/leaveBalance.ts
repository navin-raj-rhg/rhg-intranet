import { and, asc, eq, inArray } from 'drizzle-orm'
import type { useDb } from '~~/server/db/client'
import {
  leaveApplications,
  leaveBalanceAdjustments,
  leaveTypeEntitlements,
  leaveTypes
} from '~~/server/db/schema'
import {
  computeLeaveBalance,
  restrictionFor,
  type BalanceInput,
  type EntitlementTier,
  type ISODate,
  type LeaveApplicationLike,
  type LeaveBalance,
  type LeaveProfileDates,
  type RestrictionInfo
} from '~~/shared/utils/leaveRules'

/**
 * Database side of the leave rules (Step 10.5): loads one employee's leave
 * data in a handful of queries, then hands it to the pure functions in
 * shared/utils/leaveRules.ts. All the rules live there; nothing here decides
 * anything. Functions take `db` as an argument so they can also be tested
 * against a plain local Postgres.
 */

export const LEAVE_TOOL_ID = 'leave-applications'

// "Today" (which decides the current leave cycle) is the company's calendar
// date, not the server's: Railway runs in UTC, which is 8 hours behind KL.
export const COMPANY_TIMEZONE = 'Asia/Kuala_Lumpur'

export function todayISO(now: Date = new Date()): ISODate {
  // The 'en-CA' locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: COMPANY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now)
}

type Db = ReturnType<typeof useDb>
export type LeaveTypeRow = typeof leaveTypes.$inferSelect

/** A pending/approved application as loaded (keeps its id so one can be left out of a check). */
export interface ContextApplication extends LeaveApplicationLike {
  id: number
}

export interface LeaveContext {
  profile: LeaveProfileDates
  /** Active leave types only, in display order. */
  types: LeaveTypeRow[]
  tiers: Map<number, EntitlementTier[]>
  adjustments: Map<number, { cycleStartYear: number, days: number }[]>
  /** Pending and approved applications only (the ones that use up days). */
  applications: Map<number, ContextApplication[]>
}

function pushTo<T>(map: Map<number, T[]>, key: number, value: T) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

export async function loadLeaveContext(db: Db, employeeId: string): Promise<LeaveContext> {
  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, employeeId)
  })
  if (!profile) {
    throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  }

  const types = await db
    .select()
    .from(leaveTypes)
    .where(eq(leaveTypes.active, true))
    .orderBy(asc(leaveTypes.sortOrder), asc(leaveTypes.id))

  const ctx: LeaveContext = {
    profile: { dateOfBirth: profile.dateOfBirth, joinDate: profile.joinDate },
    types,
    tiers: new Map(),
    adjustments: new Map(),
    applications: new Map()
  }
  if (types.length === 0) return ctx

  const typeIds = types.map(t => t.id)

  const tierRows = await db
    .select()
    .from(leaveTypeEntitlements)
    .where(inArray(leaveTypeEntitlements.leaveTypeId, typeIds))
  for (const t of tierRows) {
    // numeric columns come back from Postgres as strings.
    pushTo(ctx.tiers, t.leaveTypeId, { minYearsService: t.minYearsService, days: Number(t.days) })
  }

  const adjustmentRows = await db
    .select()
    .from(leaveBalanceAdjustments)
    .where(eq(leaveBalanceAdjustments.employeeId, employeeId))
  for (const a of adjustmentRows) {
    pushTo(ctx.adjustments, a.leaveTypeId, { cycleStartYear: a.cycleStartYear, days: Number(a.days) })
  }

  const applicationRows = await db
    .select()
    .from(leaveApplications)
    .where(and(
      eq(leaveApplications.employeeId, employeeId),
      inArray(leaveApplications.status, ['pending', 'approved'])
    ))
  for (const a of applicationRows) {
    pushTo(ctx.applications, a.leaveTypeId, {
      id: a.id,
      startDate: a.startDate,
      endDate: a.endDate,
      startHalfDay: a.startHalfDay,
      endHalfDay: a.endHalfDay,
      status: a.status
    })
  }

  return ctx
}

/** Everything the pure balance functions need for one leave type (minus asOf). */
export function balanceInputFor(
  ctx: LeaveContext,
  type: LeaveTypeRow
): Omit<BalanceInput, 'asOf' | 'applications'> & { applications: ContextApplication[] } {
  return {
    cycleStartMonth: type.cycleStartMonth,
    hasBalance: type.hasBalance,
    tiers: ctx.tiers.get(type.id) ?? [],
    adjustments: ctx.adjustments.get(type.id) ?? [],
    applications: ctx.applications.get(type.id) ?? [],
    joinDate: ctx.profile.joinDate
  }
}

export interface LeaveTypeBalance {
  leaveTypeId: number
  key: string
  name: string
  cycleStartMonth: number
  hasBalance: boolean
  dateRestriction: LeaveTypeRow['dateRestriction']
  /** For the form: which month this person may take it in, or what's missing. */
  restriction: RestrictionInfo
  /** null for types without a balance (Unpaid). */
  balance: LeaveBalance | null
}

export function buildLeaveBalances(ctx: LeaveContext, asOf: ISODate): LeaveTypeBalance[] {
  return ctx.types.map(type => ({
    leaveTypeId: type.id,
    key: type.key,
    name: type.name,
    cycleStartMonth: type.cycleStartMonth,
    hasBalance: type.hasBalance,
    dateRestriction: type.dateRestriction,
    restriction: restrictionFor(type.dateRestriction, ctx.profile),
    balance: computeLeaveBalance({ ...balanceInputFor(ctx, type), asOf })
  }))
}
