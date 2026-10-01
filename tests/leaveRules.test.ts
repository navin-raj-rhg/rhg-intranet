import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  countLeaveDays,
  validateLeaveDates,
  cycleForDate,
  completedYearsOfService,
  entitlementForYears,
  checkDateRestriction,
  computeLeaveBalance,
  checkRequestAgainstBalance,
  findLeaveConflict,
  canCancelLeave,
  validateProfileDates,
  holidaysOnWorkdays,
  holidayNameProblem
} from '../shared/utils/leaveRules.ts'

const r = (startDate: string, endDate: string, startHalfDay = false, endHalfDay = false) => ({
  startDate, endDate, startHalfDay, endHalfDay
})

const ANNUAL = [
  { minYearsService: 0, days: 14 },
  { minYearsService: 2, days: 20 },
  { minYearsService: 5, days: 22 }
]

const base = {
  cycleStartMonth: 1,
  hasBalance: true,
  tiers: ANNUAL,
  adjustments: [],
  applications: [],
  joinDate: '2020-03-15'
}

/* ---- counting ---- */
test('counts Mon-Fri only', () => {
  assert.equal(countLeaveDays(r('2026-10-05', '2026-10-09')), 5) // Mon-Fri
  assert.equal(countLeaveDays(r('2026-10-09', '2026-10-12')), 2) // Fri-Mon skips weekend
  assert.equal(countLeaveDays(r('2026-10-03', '2026-10-04')), 0) // Sat-Sun
  assert.equal(countLeaveDays(r('2028-02-29', '2028-02-29')), 1) // leap day (Tue)
})

test('half days', () => {
  assert.equal(countLeaveDays(r('2026-10-09', '2026-10-09', true)), 0.5)
  assert.equal(countLeaveDays(r('2026-10-05', '2026-10-09', true, true)), 4)
  assert.equal(countLeaveDays(r('2026-10-05', '2026-10-09', true, false)), 4.5)
})

test('date validation', () => {
  assert.equal(validateLeaveDates(r('2026-10-05', '2026-10-09')), null)
  assert.equal(validateLeaveDates(r('2026-10-09', '2026-10-09', true)), null)
  assert.match(validateLeaveDates(r('2026-10-09', '2026-10-08'))!, /before/)
  assert.match(validateLeaveDates(r('2026-02-30', '2026-03-02'))!, /valid/)
  assert.match(validateLeaveDates(r('nonsense', '2026-03-02'))!, /valid/)
  assert.match(validateLeaveDates(r('2026-10-03', '2026-10-04'))!, /no working days/)
  assert.match(validateLeaveDates(r('2026-10-12', '2026-10-12', false, true))!, /single day/)
  assert.match(validateLeaveDates(r('2026-10-03', '2026-10-06', true))!, /weekend/) // Sat start half
  assert.match(validateLeaveDates(r('2026-10-05', '2026-10-10', false, true))!, /weekend/) // Sat end half
  assert.match(validateLeaveDates(r('2026-01-01', '2027-06-01'))!, /more than a year/)
})

/* ---- cycles ---- */
test('cycles', () => {
  assert.deepEqual(cycleForDate(1, '2026-10-05'), { startYear: 2026, start: '2026-01-01', end: '2026-12-31' })
  assert.deepEqual(cycleForDate(7, '2026-10-05'), { startYear: 2026, start: '2026-07-01', end: '2027-06-30' })
  assert.deepEqual(cycleForDate(7, '2026-03-01'), { startYear: 2025, start: '2025-07-01', end: '2026-06-30' })
  assert.equal(cycleForDate(7, '2026-06-30').startYear, 2025) // last day of old cycle
  assert.equal(cycleForDate(7, '2026-07-01').startYear, 2026) // first day of new cycle
  assert.equal(cycleForDate(1, '2026-12-31').startYear, 2026)
  assert.equal(cycleForDate(1, '2027-01-01').startYear, 2027)
  assert.equal(cycleForDate(3, '2027-03-10').end, '2028-02-29') // leap-year February end
})

/* ---- service tiers ---- */
test('years of service', () => {
  assert.equal(completedYearsOfService('2020-03-15', '2022-03-14'), 1)
  assert.equal(completedYearsOfService('2020-03-15', '2022-03-15'), 2)
  assert.equal(completedYearsOfService('2020-03-15', '2026-10-01'), 6)
  assert.equal(completedYearsOfService(null, '2026-10-01'), 0)
  assert.equal(completedYearsOfService('2026-10-01', '2026-09-01'), 0) // not yet joined
  assert.equal(completedYearsOfService('2020-02-29', '2021-02-28'), 0)
  assert.equal(completedYearsOfService('2020-02-29', '2021-03-01'), 1)
})

test('entitlement tiers (annual 14/20/22)', () => {
  assert.equal(entitlementForYears(ANNUAL, 0), 14)
  assert.equal(entitlementForYears(ANNUAL, 1), 14)
  assert.equal(entitlementForYears(ANNUAL, 2), 20)
  assert.equal(entitlementForYears(ANNUAL, 4), 20)
  assert.equal(entitlementForYears(ANNUAL, 5), 22)
  assert.equal(entitlementForYears(ANNUAL, 30), 22)
  assert.equal(entitlementForYears([...ANNUAL].reverse(), 3), 20) // order-independent
  assert.equal(entitlementForYears([], 3), 0)
})

/* ---- date restrictions ---- */
test('birth month / join month restrictions', () => {
  const p = { dateOfBirth: '1990-08-01', joinDate: '2020-03-15' }
  assert.deepEqual(checkDateRestriction('none', r('2026-01-05', '2026-01-06'), p), { ok: true })
  assert.deepEqual(checkDateRestriction('birth_month', r('2026-08-10', '2026-08-10'), p), { ok: true })
  assert.deepEqual(checkDateRestriction('birth_month', r('2027-08-02', '2027-08-03'), p), { ok: true })
  assert.equal(checkDateRestriction('birth_month', r('2026-09-01', '2026-09-01'), p).ok, false)
  assert.equal(checkDateRestriction('birth_month', r('2026-08-31', '2026-09-01'), p).ok, false) // spills out
  assert.equal(checkDateRestriction('birth_month', r('2026-07-31', '2026-08-03'), p).ok, false) // starts before
  assert.equal(checkDateRestriction('birth_month', r('2026-08-25', '2027-08-05'), p).ok, false) // two Augusts
  assert.deepEqual(checkDateRestriction('join_month', r('2026-03-16', '2026-03-16'), p), { ok: true })
  const bad = checkDateRestriction('join_month', r('2026-04-01', '2026-04-01'), p)
  assert.equal(bad.ok, false)
  assert.match(!bad.ok ? bad.reason : '', /March/)
  const missing = checkDateRestriction('birth_month', r('2026-08-10', '2026-08-10'), { dateOfBirth: null, joinDate: null })
  assert.equal(missing.ok, false)
  assert.match(!missing.ok ? missing.reason : '', /date of birth/)
})

/* ---- balances ---- */
test('annual balance: tiers, approved/pending, ignores other statuses and cycles', () => {
  const b = computeLeaveBalance({
    ...base,
    asOf: '2026-10-05',
    adjustments: [{ cycleStartYear: 2026, days: 3 }, { cycleStartYear: 2025, days: 9 }],
    applications: [
      { ...r('2026-10-05', '2026-10-09'), status: 'approved' }, // 5
      { ...r('2026-11-02', '2026-11-03'), status: 'pending' }, // 2
      { ...r('2026-06-01', '2026-06-05'), status: 'rejected' },
      { ...r('2026-06-08', '2026-06-12'), status: 'cancelled' },
      { ...r('2025-03-03', '2025-03-07'), status: 'approved' } // last year
    ]
  })
  assert.ok(b)
  assert.equal(b.yearsOfService, 6)
  assert.equal(b.entitled, 22)
  assert.equal(b.adjustments, 3)
  assert.equal(b.used, 5)
  assert.equal(b.pending, 2)
  assert.equal(b.remaining, 18)
})

test('tier steps up on the anniversary date', () => {
  const j = { ...base, joinDate: '2024-06-01' }
  assert.equal(computeLeaveBalance({ ...j, asOf: '2026-05-31' })!.entitled, 14)
  assert.equal(computeLeaveBalance({ ...j, asOf: '2026-06-01' })!.entitled, 20)
})

test('application straddling year end is split by cycle', () => {
  const apps = [{ ...r('2026-12-30', '2027-01-04'), status: 'approved' as const }] // Wed-Mon: 2 + 2 working days
  assert.equal(computeLeaveBalance({ ...base, applications: apps, asOf: '2026-12-01' })!.used, 2)
  assert.equal(computeLeaveBalance({ ...base, applications: apps, asOf: '2027-02-01' })!.used, 2)
})

test('July-June cycle (wellness day) splits at 30 Jun / 1 Jul', () => {
  const wellness = {
    ...base, cycleStartMonth: 7, tiers: [{ minYearsService: 0, days: 1 }],
    applications: [{ ...r('2026-06-30', '2026-07-02'), status: 'approved' as const }] // Tue-Thu
  }
  assert.equal(computeLeaveBalance({ ...wellness, asOf: '2026-08-01' })!.used, 2) // Jul 1-2
  assert.equal(computeLeaveBalance({ ...wellness, asOf: '2026-06-15' })!.used, 1) // Jun 30
})

test('no-balance type (unpaid) and negative adjustment', () => {
  assert.equal(computeLeaveBalance({ ...base, hasBalance: false, asOf: '2026-10-05' }), null)
  assert.deepEqual(checkRequestAgainstBalance({ ...base, hasBalance: false }, r('2026-10-05', '2026-10-05')), [])
  const mat = computeLeaveBalance({
    ...base, tiers: [{ minYearsService: 0, days: 60 }], asOf: '2026-10-05',
    adjustments: [{ cycleStartYear: 2026, days: -60 }]
  })!
  assert.equal(mat.remaining, 0)
})

/* ---- request vs balance (warn-only) ---- */
test('request check: within, exactly at, and over the balance', () => {
  const wellness = { ...base, cycleStartMonth: 7, tiers: [{ minYearsService: 0, days: 1 }] }
  const one = checkRequestAgainstBalance(wellness, r('2026-10-05', '2026-10-05'))
  assert.equal(one.length, 1)
  assert.equal(one[0]!.remainingAfter, 0)
  assert.equal(one[0]!.exceeds, false)
  const two = checkRequestAgainstBalance(wellness, r('2026-10-05', '2026-10-06'))
  assert.equal(two[0]!.exceeds, true)
  assert.equal(two[0]!.remainingAfter, -1)
})

test('request check: birthday half day against 0.5 entitlement', () => {
  const bday = { ...base, tiers: [{ minYearsService: 0, days: 0.5 }] }
  const c = checkRequestAgainstBalance(bday, r('2026-08-10', '2026-08-10', true))
  assert.equal(c[0]!.remainingAfter, 0)
  assert.equal(c[0]!.exceeds, false)
})

test('request check: straddling request reports each cycle separately', () => {
  const c = checkRequestAgainstBalance(base, r('2026-12-30', '2027-01-04'))
  assert.equal(c.length, 2)
  assert.deepEqual(c.map(x => x.requested), [2, 2])
  assert.deepEqual(c.map(x => x.cycle.startYear), [2026, 2027])
})

test('request check: existing pending days reduce what is left', () => {
  const c = checkRequestAgainstBalance(
    { ...base, joinDate: '2026-01-01', applications: [{ ...r('2026-10-05', '2026-10-16'), status: 'pending' }] }, // 10 pending of 14
    r('2026-11-02', '2026-11-06') // 5 more
  )
  assert.equal(c[0]!.remainingBefore, 4)
  assert.equal(c[0]!.exceeds, true)
})

/* ---- clashes and cancelling ---- */
test('clash detection across any leave, with half days', () => {
  const week = [r('2026-10-05', '2026-10-09')] // Mon-Fri
  assert.equal(findLeaveConflict(week, r('2026-10-08', '2026-10-12')), '2026-10-08')
  assert.equal(findLeaveConflict(week, r('2026-10-10', '2026-10-11')), null) // weekend only
  assert.equal(findLeaveConflict(week, r('2026-10-12', '2026-10-13')), null) // next week
  assert.equal(findLeaveConflict(week, r('2026-10-09', '2026-10-09', true)), '2026-10-09') // half on a full day
  const half = [r('2026-10-09', '2026-10-09', true)] // 0.5 on Fri
  assert.equal(findLeaveConflict(half, r('2026-10-09', '2026-10-12', false, false)), '2026-10-09') // full over half
  assert.equal(findLeaveConflict(half, r('2026-10-05', '2026-10-09', false, true)), null) // Mon-Fri, Fri morning half only
  assert.equal(findLeaveConflict([], r('2026-10-05', '2026-10-09')), null)
})

test('who can cancel and when', () => {
  assert.equal(canCancelLeave('pending', '2026-01-01', '2026-10-01'), true) // even if the date has passed
  assert.equal(canCancelLeave('approved', '2026-10-02', '2026-10-01'), true)
  assert.equal(canCancelLeave('approved', '2026-10-01', '2026-10-01'), false) // starts today = started
  assert.equal(canCancelLeave('approved', '2026-09-30', '2026-10-01'), false)
  assert.equal(canCancelLeave('rejected', '2026-12-01', '2026-10-01'), false)
  assert.equal(canCancelLeave('cancelled', '2026-12-01', '2026-10-01'), false)
})

test('owner-entered profile dates are sanity checked', () => {
  const today = '2026-09-30'
  const check = (joinDate: string | null, dateOfBirth: string | null) => validateProfileDates({ joinDate, dateOfBirth }, today)
  assert.equal(check('2020-03-15', '1990-08-01'), null)
  assert.equal(check(null, null), null) // clearing both is allowed
  assert.equal(check('2020-03-15', null), null)
  assert.equal(check('2026-12-01', '1990-08-01'), null) // starts soon
  assert.match(check('2020-13-45', null)!, /valid/)
  assert.match(check(null, '2026-09-30')!, /past/) // born today
  assert.match(check(null, '2030-01-01')!, /past/)
  assert.match(check(null, '1850-01-01')!, /past/)
  assert.match(check('2062-01-01', null)!, /far in the future/) // typo of 2026
  assert.match(check('1985-01-01', '1990-08-01')!, /after the date of birth/) // swapped
})

/* ---- public holidays (Step 13.8) ---- */

test('a public holiday on a working day is not counted as leave', () => {
  // Mon 2026-08-31 to Fri 2026-09-04 is 5 working days; a Wednesday holiday makes it 4.
  const base = { startDate: '2026-08-31', endDate: '2026-09-04', startHalfDay: false, endHalfDay: false }
  assert.equal(countLeaveDays(base), 5)
  assert.equal(countLeaveDays({ ...base, holidays: ['2026-09-02'] }), 4)
})

test('a holiday on a weekend changes nothing, and only holidays inside the dates matter', () => {
  const all = [
    { date: '2026-08-29', name: 'Saturday holiday' },
    { date: '2026-09-02', name: 'Midweek holiday' },
    { date: '2026-09-10', name: 'Outside the dates' }
  ]
  assert.deepEqual(holidaysOnWorkdays('2026-08-31', '2026-09-04', all), [{ date: '2026-09-02', name: 'Midweek holiday' }])
})

test('a request made only of holidays and weekends is refused', () => {
  const r = { startDate: '2026-09-02', endDate: '2026-09-02', startHalfDay: false, endHalfDay: false, holidays: ['2026-09-02'] }
  assert.match(validateLeaveDates(r)!, /no working days/)
})

test('a half day cannot be taken on a public holiday', () => {
  const r = { startDate: '2026-09-02', endDate: '2026-09-03', startHalfDay: true, endHalfDay: false, holidays: ['2026-09-02'] }
  assert.match(validateLeaveDates(r)!, /public holiday, so it cannot be a half day/)
})

test('leave saved before a holiday was added keeps its own count', () => {
  const saved = { startDate: '2026-08-31', endDate: '2026-09-04', startHalfDay: false, endHalfDay: false, holidays: [] }
  assert.equal(countLeaveDays(saved), 5)
})

test('holiday names are checked', () => {
  assert.equal(holidayNameProblem('Merdeka Day'), '')
  assert.match(holidayNameProblem('   '), /Enter a name/)
  assert.match(holidayNameProblem('x'.repeat(81)), /80 characters/)
})
