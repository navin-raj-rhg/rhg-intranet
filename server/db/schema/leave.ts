import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  date,
  integer,
  boolean,
  timestamp,
  check,
  unique
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { profiles } from './core'

/**
 * Restricts WHEN a leave type can be taken. Enforced by the API (the whole
 * start-to-end range must fall inside the allowed month), not by the DB.
 *  - none:       any date
 *  - birth_month: the applicant's date-of-birth month (Birthday leave)
 *  - join_month:  the applicant's join-date month (Anniversary leave)
 * Add further values later (e.g. 'fixed_months') without touching old rows.
 */
export const leaveDateRestriction = pgEnum('leave_date_restriction', [
  'none',
  'birth_month',
  'join_month'
])

/**
 * pending -> approved | rejected. The applicant can cancel while pending, and
 * can cancel approved leave that hasn't started yet (enforced at the API).
 */
export const leaveApplicationStatus = pgEnum('leave_application_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled'
])

/**
 * One row per leave policy. Leave types are DATA, not a code enum: inserting
 * a row here (plus its entitlements below) makes the type appear everywhere.
 */
export const leaveTypes = pgTable(
  'leave_types',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    key: text('key').notNull().unique(), // slug, e.g. 'annual', 'wellness_day'
    name: text('name').notNull(), // display label, e.g. 'Annual Leave'
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    // Month the policy's year begins: 1 = Jan-Dec, 7 = Jul-Jun (following
    // year). A cycle is identified by the calendar YEAR IT STARTS IN.
    cycleStartMonth: integer('cycle_start_month').notNull().default(1),
    // false = unlimited (e.g. Unpaid): no entitlement rows, no balance shown.
    hasBalance: boolean('has_balance').notNull().default(true),
    dateRestriction: leaveDateRestriction('date_restriction').notNull().default('none'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    check('leave_types_cycle_start_month_range', sql`${table.cycleStartMonth} between 1 and 12`)
  ]
)

/**
 * Days granted per cycle, in tiers by completed years of service. The app
 * uses the row with the highest min_years_service the employee has reached.
 * A flat policy (Wellness Day = 1) has a single row at 0 years.
 */
export const leaveTypeEntitlements = pgTable(
  'leave_type_entitlements',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    leaveTypeId: integer('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id, { onDelete: 'cascade' }),
    minYearsService: integer('min_years_service').notNull().default(0),
    days: numeric('days', { precision: 5, scale: 1 }).notNull()
  },
  table => [
    unique('leave_type_entitlements_type_years_unique').on(table.leaveTypeId, table.minYearsService),
    check('leave_type_entitlements_years_nonneg', sql`${table.minYearsService} >= 0`),
    check('leave_type_entitlements_days_nonneg', sql`${table.days} >= 0`)
  ]
)

/**
 * A leave request. `days` is the working-day count (Mon-Fri, half-days as
 * 0.5), calculated by the server and stored so history doesn't change if
 * counting rules ever do. Balances are NOT stored - they're derived from
 * entitlements, adjustments and these rows.
 *
 * Half-days: `startHalfDay` = only the afternoon of start_date is taken;
 * `endHalfDay` = only the morning of end_date is taken. A single-day request
 * uses `startHalfDay` alone for a half day.
 */
export const leaveApplications = pgTable(
  'leave_applications',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => profiles.id),
    leaveTypeId: integer('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    startHalfDay: boolean('start_half_day').notNull().default(false),
    endHalfDay: boolean('end_half_day').notNull().default(false),
    days: numeric('days', { precision: 5, scale: 1 }).notNull(),
    reason: text('reason'),
    // R2 object key for an optional attachment (e.g. medical certificate).
    attachmentKey: text('attachment_key'),
    status: leaveApplicationStatus('status').notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => profiles.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    check('leave_applications_dates_ordered', sql`${table.endDate} >= ${table.startDate}`),
    check('leave_applications_days_positive', sql`${table.days} > 0`),
    // On a single-day request only start_half_day is used.
    check(
      'leave_applications_single_day_half',
      sql`${table.startDate} <> ${table.endDate} or ${table.endHalfDay} = false`
    )
  ]
)

/**
 * Owner-made manual correction for one employee, leave type and cycle:
 * carry-forward, corrections, or zeroing an entitlement (e.g. Maternity for
 * someone it doesn't apply to). Positive adds days, negative removes them.
 * `cycleStartYear` is the year the cycle begins in (see leave_types).
 */
export const leaveBalanceAdjustments = pgTable(
  'leave_balance_adjustments',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    leaveTypeId: integer('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id, { onDelete: 'cascade' }),
    cycleStartYear: integer('cycle_start_year').notNull(),
    days: numeric('days', { precision: 5, scale: 1 }).notNull(),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [check('leave_balance_adjustments_days_nonzero', sql`${table.days} <> 0`)]
)
