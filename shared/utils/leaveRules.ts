/**
 * Pure leave rules (Step 10.4). No imports and no database access, so the
 * same code runs in the API, in the application form (live day count, greyed-
 * out dates) and in the tests. All dates are plain 'YYYY-MM-DD' strings and
 * all date maths is done in UTC, so the server's timezone never matters.
 */

export type ISODate = string

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type LeaveDateRestriction = 'none' | 'birth_month' | 'join_month'

export interface LeaveDateRange {
  startDate: ISODate
  endDate: ISODate
  /** Only the afternoon of startDate is taken. */
  startHalfDay: boolean
  /** Only the morning of endDate is taken (multi-day requests only). */
  endHalfDay: boolean
}

export interface LeaveCycle {
  /** The calendar year the cycle STARTS in (Jul 2026 - Jun 2027 = 2026). */
  startYear: number
  start: ISODate
  end: ISODate
}

export interface EntitlementTier {
  minYearsService: number
  days: number
}

export interface LeaveProfileDates {
  dateOfBirth: ISODate | null
  joinDate: ISODate | null
}

export const MAX_LEAVE_SPAN_DAYS = 366

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const DAY_MS = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

function parseISO(iso: string): { y: number, m: number, d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const check = new Date(Date.UTC(y, m - 1, d))
  // Rejects things like 2026-02-30 that JS would silently roll over.
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null
  }
  return { y, m, d }
}

export function isValidISODate(iso: string): boolean {
  return parseISO(iso) !== null
}

function toMs(iso: ISODate): number {
  const p = parseISO(iso)
  return p ? Date.UTC(p.y, p.m - 1, p.d) : Number.NaN
}

function fromMs(ms: number): ISODate {
  const dt = new Date(ms)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export function addDaysISO(iso: ISODate, n: number): ISODate {
  return fromMs(toMs(iso) + n * DAY_MS)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Monday to Friday. (Public holidays are not modelled in v1.) */
export function isWorkingDay(iso: ISODate): boolean {
  const dow = new Date(toMs(iso)).getUTCDay() // 0 = Sun ... 6 = Sat
  return dow >= 1 && dow <= 5
}

/* ------------------------------------------------------------------ */
/* Counting days                                                       */
/* ------------------------------------------------------------------ */

/**
 * One entry per WORKING day in the request, with its weight (1, or 0.5 for a
 * half day). Returns [] if the dates are invalid or the span is too long.
 * Everything else (total, days inside a cycle) is derived from this.
 */
export function leaveDayWeights(range: LeaveDateRange): { date: ISODate, weight: number }[] {
  const startMs = toMs(range.startDate)
  const endMs = toMs(range.endDate)
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return []
  if ((endMs - startMs) / DAY_MS + 1 > MAX_LEAVE_SPAN_DAYS) return []

  const single = range.startDate === range.endDate
  const out: { date: ISODate, weight: number }[] = []
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    const date = fromMs(ms)
    if (!isWorkingDay(date)) continue
    let weight = 1
    if (date === range.startDate && range.startHalfDay) weight = 0.5
    else if (!single && date === range.endDate && range.endHalfDay) weight = 0.5
    out.push({ date, weight })
  }
  return out
}

/** Total working days requested (half days count 0.5). */
export function countLeaveDays(range: LeaveDateRange): number {
  return leaveDayWeights(range).reduce((sum, d) => sum + d.weight, 0)
}

/** Working days of the request that fall between `from` and `to` inclusive. */
export function leaveDaysWithin(range: LeaveDateRange, from: ISODate, to: ISODate): number {
  return leaveDayWeights(range)
    .filter(d => d.date >= from && d.date <= to)
    .reduce((sum, d) => sum + d.weight, 0)
}

/** Returns an error message, or null if the request's dates are acceptable. */
export function validateLeaveDates(range: LeaveDateRange): string | null {
  if (!isValidISODate(range.startDate) || !isValidISODate(range.endDate)) {
    return 'Please enter valid start and end dates.'
  }
  if (range.endDate < range.startDate) {
    return 'The end date cannot be before the start date.'
  }
  if ((toMs(range.endDate) - toMs(range.startDate)) / DAY_MS + 1 > MAX_LEAVE_SPAN_DAYS) {
    return 'A single application cannot span more than a year.'
  }
  const single = range.startDate === range.endDate
  if (single && range.endHalfDay) {
    return 'For a single day, use the start half-day option only.'
  }
  if (range.startHalfDay && !isWorkingDay(range.startDate)) {
    return 'The start date is a weekend, so it cannot be a half day.'
  }
  if (range.endHalfDay && !isWorkingDay(range.endDate)) {
    return 'The end date is a weekend, so it cannot be a half day.'
  }
  if (countLeaveDays(range) === 0) {
    return 'The selected dates contain no working days.'
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Owner-entered profile dates                                         */
/* ------------------------------------------------------------------ */

/**
 * Sanity checks for the join date and date of birth the owner types in, so a
 * typo (a swapped pair, the year 2062) can't quietly change someone's tier or
 * birthday leave. Either may be null (not set). Returns a message or null.
 */
export function validateProfileDates(
  dates: { joinDate: ISODate | null, dateOfBirth: ISODate | null },
  today: ISODate
): string | null {
  const { joinDate, dateOfBirth } = dates
  if ((joinDate !== null && !isValidISODate(joinDate)) || (dateOfBirth !== null && !isValidISODate(dateOfBirth))) {
    return 'Please enter valid dates.'
  }
  if (dateOfBirth !== null && (dateOfBirth >= today || dateOfBirth < '1900-01-01')) {
    return 'The date of birth must be a past date.'
  }
  // A join date a little in the future is fine (someone about to start).
  if (joinDate !== null && joinDate > addDaysISO(today, 366)) {
    return 'The join date is too far in the future.'
  }
  if (joinDate !== null && dateOfBirth !== null && joinDate <= dateOfBirth) {
    return 'The join date must be after the date of birth.'
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Clashes and cancelling                                              */
/* ------------------------------------------------------------------ */

/**
 * First date on which `request` would push the person's leave past one full
 * day, given their existing pending/approved leave of ANY type; null if none.
 * Weights are added per date, so a morning half-day and an afternoon half-day
 * on the same date are fine, but a half day on top of a full day is not.
 */
export function findLeaveConflict(existing: LeaveDateRange[], request: LeaveDateRange): ISODate | null {
  const used = new Map<ISODate, number>()
  for (const e of existing) {
    for (const d of leaveDayWeights(e)) {
      used.set(d.date, (used.get(d.date) ?? 0) + d.weight)
    }
  }
  for (const d of leaveDayWeights(request)) {
    if ((used.get(d.date) ?? 0) + d.weight > 1) return d.date
  }
  return null
}

/**
 * Pending leave can always be cancelled; approved leave only until its start
 * date (a start date of today counts as started). Rejected and already-
 * cancelled applications cannot be cancelled.
 */
export function canCancelLeave(status: LeaveStatus, startDate: ISODate, today: ISODate): boolean {
  if (status === 'pending') return true
  if (status === 'approved') return startDate > today
  return false
}

/* ------------------------------------------------------------------ */
/* Cycles                                                              */
/* ------------------------------------------------------------------ */

/** The cycle that begins in `startYear` for a policy starting in `cycleStartMonth`. */
export function cycleForStartYear(cycleStartMonth: number, startYear: number): LeaveCycle {
  const endMonth = cycleStartMonth === 1 ? 12 : cycleStartMonth - 1
  const endYear = cycleStartMonth === 1 ? startYear : startYear + 1
  return {
    startYear,
    start: `${startYear}-${pad(cycleStartMonth)}-01`,
    end: `${endYear}-${pad(endMonth)}-${pad(daysInMonth(endYear, endMonth))}`
  }
}

/** The cycle that contains `date`. */
export function cycleForDate(cycleStartMonth: number, date: ISODate): LeaveCycle {
  const p = parseISO(date)
  if (!p) throw new Error(`Invalid date: ${date}`)
  const startYear = p.m >= cycleStartMonth ? p.y : p.y - 1
  return cycleForStartYear(cycleStartMonth, startYear)
}

/* ------------------------------------------------------------------ */
/* Service tiers                                                       */
/* ------------------------------------------------------------------ */

/** Whole years completed between joinDate and asOf. 0 if unknown or not yet joined. */
export function completedYearsOfService(joinDate: ISODate | null, asOf: ISODate): number {
  if (!joinDate) return 0
  const j = parseISO(joinDate)
  const a = parseISO(asOf)
  if (!j || !a) return 0
  let years = a.y - j.y
  // Anniversary not yet reached this year (a 29 Feb joiner reaches it on 1 Mar
  // in non-leap years, which this comparison gives naturally).
  if (a.m < j.m || (a.m === j.m && a.d < j.d)) years -= 1
  return Math.max(0, years)
}

/** Days from the highest tier the employee has reached; 0 if there are no tiers. */
export function entitlementForYears(tiers: EntitlementTier[], years: number): number {
  let best: EntitlementTier | null = null
  for (const t of tiers) {
    if (t.minYearsService <= years && (!best || t.minYearsService > best.minYearsService)) {
      best = t
    }
  }
  return best ? best.days : 0
}

/* ------------------------------------------------------------------ */
/* Date restrictions (Birthday / Anniversary)                          */
/* ------------------------------------------------------------------ */

export type RestrictionInfo
  = | { kind: 'any' }
    | { kind: 'month', month: number }
    | { kind: 'missing', field: 'date_of_birth' | 'join_date' }

/** Which month (if any) a restricted leave type is limited to for this person. */
export function restrictionFor(
  restriction: LeaveDateRestriction,
  profile: LeaveProfileDates
): RestrictionInfo {
  if (restriction === 'none') return { kind: 'any' }
  const source = restriction === 'birth_month' ? profile.dateOfBirth : profile.joinDate
  const parsed = source ? parseISO(source) : null
  if (!parsed) {
    return { kind: 'missing', field: restriction === 'birth_month' ? 'date_of_birth' : 'join_date' }
  }
  return { kind: 'month', month: parsed.m }
}

export type RestrictionCheck = { ok: true } | { ok: false, reason: string }

/** The whole start-to-end range must sit inside the allowed month of ONE year. */
export function checkDateRestriction(
  restriction: LeaveDateRestriction,
  range: Pick<LeaveDateRange, 'startDate' | 'endDate'>,
  profile: LeaveProfileDates
): RestrictionCheck {
  const info = restrictionFor(restriction, profile)
  if (info.kind === 'any') return { ok: true }

  if (info.kind === 'missing') {
    const what = info.field === 'date_of_birth' ? 'date of birth' : 'join date'
    return { ok: false, reason: `Your ${what} has not been set. Please ask the owner to add it.` }
  }

  const start = parseISO(range.startDate)
  const end = parseISO(range.endDate)
  const monthName = MONTH_NAMES[info.month - 1] ?? ''
  const label = restriction === 'birth_month' ? 'birth month' : 'work-anniversary month'
  const inside = !!start && !!end && start.y === end.y && start.m === info.month && end.m === info.month
  return inside
    ? { ok: true }
    : { ok: false, reason: `This leave can only be taken in your ${label} (${monthName}), and the whole period must fall within it.` }
}

/* ------------------------------------------------------------------ */
/* Balances                                                            */
/* ------------------------------------------------------------------ */

export interface LeaveApplicationLike extends LeaveDateRange {
  status: LeaveStatus
}

export interface BalanceInput {
  cycleStartMonth: number
  hasBalance: boolean
  tiers: EntitlementTier[]
  adjustments: { cycleStartYear: number, days: number }[]
  /** This employee's applications for THIS leave type only. */
  applications: LeaveApplicationLike[]
  joinDate: ISODate | null
  /** Picks both the cycle and the service tier (see note on tiers below). */
  asOf: ISODate
}

export interface LeaveBalance {
  cycle: LeaveCycle
  yearsOfService: number
  entitled: number
  adjustments: number
  /** Approved days inside the cycle. */
  used: number
  /** Pending days inside the cycle (held until decided). */
  pending: number
  remaining: number
}

/**
 * The balance for the cycle containing `asOf`, or null for types with no
 * balance (Unpaid). Nothing is stored: it is entitlement + adjustments -
 * approved - pending, recalculated from the rows each time.
 *
 * Service tier: years of service are counted as at `asOf`, and the resulting
 * tier applies to the whole cycle (no pro-rating). For a display balance,
 * asOf is today; when checking an application, it is the date being taken.
 *
 * An application that straddles two cycles is split by date: each working day
 * counts against the cycle it falls in.
 */
export function computeLeaveBalance(input: BalanceInput): LeaveBalance | null {
  if (!input.hasBalance) return null

  const cycle = cycleForDate(input.cycleStartMonth, input.asOf)
  const yearsOfService = completedYearsOfService(input.joinDate, input.asOf)
  const entitled = entitlementForYears(input.tiers, yearsOfService)
  const adjustments = input.adjustments
    .filter(a => a.cycleStartYear === cycle.startYear)
    .reduce((sum, a) => sum + a.days, 0)

  let used = 0
  let pending = 0
  for (const app of input.applications) {
    if (app.status !== 'approved' && app.status !== 'pending') continue
    const days = leaveDaysWithin(app, cycle.start, cycle.end)
    if (app.status === 'approved') used += days
    else pending += days
  }

  return {
    cycle,
    yearsOfService,
    entitled,
    adjustments,
    used,
    pending,
    remaining: entitled + adjustments - used - pending
  }
}

export interface CycleBalanceCheck {
  cycle: LeaveCycle
  /** Days of this request falling in the cycle. */
  requested: number
  remainingBefore: number
  remainingAfter: number
  exceeds: boolean
}

/**
 * How a new request would affect the balance, one entry per cycle it touches
 * (usually one). Empty for types with no balance. The caller should leave the
 * request itself out of `input.applications` (matters when editing/approving).
 * This is advisory: the app warns but does not block.
 */
export function checkRequestAgainstBalance(
  input: Omit<BalanceInput, 'asOf'>,
  request: LeaveDateRange
): CycleBalanceCheck[] {
  if (!input.hasBalance) return []

  const byCycle = new Map<number, { firstDate: ISODate, days: number }>()
  for (const d of leaveDayWeights(request)) {
    const startYear = cycleForDate(input.cycleStartMonth, d.date).startYear
    const entry = byCycle.get(startYear)
    if (entry) entry.days += d.weight
    else byCycle.set(startYear, { firstDate: d.date, days: d.weight })
  }

  const out: CycleBalanceCheck[] = []
  for (const { firstDate, days } of [...byCycle.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1])) {
    const balance = computeLeaveBalance({ ...input, asOf: firstDate })
    if (!balance) continue
    const remainingAfter = balance.remaining - days
    out.push({
      cycle: balance.cycle,
      requested: days,
      remainingBefore: balance.remaining,
      remainingAfter,
      exceeds: remainingAfter < 0
    })
  }
  return out
}
