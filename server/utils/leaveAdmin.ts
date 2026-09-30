import { desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { useDb } from '~~/server/db/client'
import { leaveBalanceAdjustments, leaveTypes, profiles } from '~~/server/db/schema'
import { validateProfileDates, type ISODate } from '~~/shared/utils/leaveRules'

/**
 * Owner-side leave administration (Step 10.8): the profile dates that drive
 * service tiers and Birthday/Anniversary leave, and manual balance
 * adjustments. Like the other leave utils these take `db` as an argument and
 * carry their own validation, so the rules hold whichever route calls them.
 * Error messages go in the HTTP status line, so they stay plain ASCII.
 */

type Db = ReturnType<typeof useDb>

/** Sets (or clears, with null) a person's join date and date of birth. */
export async function updateProfileDates(
  db: Db,
  opts: { userId: string, joinDate: ISODate | null, dateOfBirth: ISODate | null, today: ISODate }
) {
  const problem = validateProfileDates({ joinDate: opts.joinDate, dateOfBirth: opts.dateOfBirth }, opts.today)
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })

  const [updated] = await db
    .update(profiles)
    .set({ joinDate: opts.joinDate, dateOfBirth: opts.dateOfBirth })
    .where(eq(profiles.id, opts.userId))
    .returning({
      id: profiles.id,
      email: profiles.email,
      fullName: profiles.fullName,
      joinDate: profiles.joinDate,
      dateOfBirth: profiles.dateOfBirth
    })
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  return updated
}

/**
 * Adds a manual correction to one person's balance for one leave type and
 * cycle. There is deliberately no edit or delete: a mistake is fixed by adding
 * the opposite adjustment, so the history stays a complete audit trail.
 */
export async function createLeaveAdjustment(
  db: Db,
  opts: {
    employeeId: string
    leaveTypeId: number
    cycleStartYear: number
    days: number
    reason: string
    createdBy: string
  }
) {
  if (!Number.isFinite(opts.days) || opts.days === 0 || !Number.isInteger(opts.days * 2) || Math.abs(opts.days) > 365) {
    throw createError({ statusCode: 400, statusMessage: 'Days must be a non-zero multiple of 0.5 (up to 365).' })
  }
  if (opts.cycleStartYear < 2000 || opts.cycleStartYear > 2100) {
    throw createError({ statusCode: 400, statusMessage: 'The cycle year must be between 2000 and 2100.' })
  }
  if (!opts.reason.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'A reason is required.' })
  }

  const employee = await db.query.profiles.findFirst({ where: (p, { eq }) => eq(p.id, opts.employeeId) })
  if (!employee) throw createError({ statusCode: 404, statusMessage: 'Employee not found' })

  const type = await db.query.leaveTypes.findFirst({ where: (t, { eq }) => eq(t.id, opts.leaveTypeId) })
  if (!type || !type.active) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown or inactive leave type.' })
  }
  if (!type.hasBalance) {
    throw createError({ statusCode: 400, statusMessage: `${type.name} has no balance, so it cannot be adjusted.` })
  }

  const [row] = await db
    .insert(leaveBalanceAdjustments)
    .values({
      employeeId: opts.employeeId,
      leaveTypeId: opts.leaveTypeId,
      cycleStartYear: opts.cycleStartYear,
      days: opts.days.toFixed(1),
      reason: opts.reason.trim(),
      createdBy: opts.createdBy
    })
    .returning()
  return row
}

/** One person's adjustments, newest first, with the type and who made each. */
export async function listLeaveAdjustments(db: Db, employeeId: string) {
  const creator = alias(profiles, 'creator')
  const rows = await db
    .select({
      adjustment: leaveBalanceAdjustments,
      leaveTypeName: leaveTypes.name,
      createdByName: creator.fullName,
      createdByEmail: creator.email
    })
    .from(leaveBalanceAdjustments)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveBalanceAdjustments.leaveTypeId))
    .leftJoin(creator, eq(creator.id, leaveBalanceAdjustments.createdBy))
    .where(eq(leaveBalanceAdjustments.employeeId, employeeId))
    .orderBy(desc(leaveBalanceAdjustments.createdAt), desc(leaveBalanceAdjustments.id))

  return rows.map(r => ({
    ...r.adjustment,
    leaveTypeName: r.leaveTypeName,
    createdByName: r.createdByName || r.createdByEmail || 'Unknown'
  }))
}
