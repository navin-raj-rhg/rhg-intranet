import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  awayByDate,
  gridRange,
  monthGrid,
  monthTitle,
  shiftMonth,
  weekdayShort,
  type CalendarRow
} from '../shared/utils/leaveCalendar.ts'

const row = (employeeId: string, employeeName: string, startDate: string, endDate: string, startHalfDay = false, endHalfDay = false): CalendarRow =>
  ({ employeeId, employeeName, startDate, endDate, startHalfDay, endHalfDay })

test('weekday names', () => {
  assert.equal(weekdayShort('2026-10-12'), 'Mon')
  assert.equal(weekdayShort('2026-10-04'), 'Sun')
  assert.equal(weekdayShort('2026-10-01'), 'Thu')
})

test('grid: October 2026 (starts Thursday, ends Saturday)', () => {
  const weeks = monthGrid(2026, 10)
  assert.equal(weeks.length, 5)
  assert.ok(weeks.every(w => w.length === 7))
  assert.equal(weeks[0]![0]!.date, '2026-09-28') // the Monday before the 1st
  assert.equal(weeks[4]![6]!.date, '2026-11-01') // pads to Sunday
  assert.equal(weeks[0]![0]!.inMonth, false)
  assert.equal(weeks[0]![3]!.date, '2026-10-01')
  assert.equal(weeks[0]![3]!.inMonth, true)
  assert.equal(weeks[4]![5]!.date, '2026-10-31')
  assert.equal(weeks[4]![5]!.inMonth, true)
  assert.equal(weeks[4]![6]!.inMonth, false)
  assert.deepEqual(weeks[0]!.map(d => d.isWeekend), [false, false, false, false, false, true, true])
  assert.equal(weeks.flat().filter(d => d.inMonth).length, 31)
})

test('grid: rows needed vary from 4 to 6', () => {
  assert.equal(monthGrid(2027, 2).length, 4) // Feb 2027 starts on a Monday and has 28 days
  assert.equal(monthGrid(2026, 2).length, 5) // starts on a Sunday
  assert.equal(monthGrid(2026, 8).length, 6) // starts on a Saturday, 31 days
  assert.equal(monthGrid(2028, 2).flat().filter(d => d.inMonth).length, 29) // leap year
})

test('grid range is always within the API limit, for every month', () => {
  for (let y = 2020; y <= 2035; y++) {
    for (let m = 1; m <= 12; m++) {
      const { from, to } = gridRange(y, m)
      const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1
      assert.ok(days === 28 || days === 35 || days === 42, `${y}-${m}: ${days} days`)
      assert.equal(new Date(Date.parse(from)).getUTCDay(), 1) // starts on a Monday
      assert.equal(new Date(Date.parse(to)).getUTCDay(), 0) // ends on a Sunday
    }
  }
  assert.deepEqual(gridRange(2026, 10), { from: '2026-09-28', to: '2026-11-01' })
})

test('moving between months rolls the year', () => {
  assert.deepEqual(shiftMonth(2026, 10, 1), { year: 2026, month: 11 })
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 })
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 })
  assert.deepEqual(shiftMonth(2026, 3, 0), { year: 2026, month: 3 })
  assert.deepEqual(shiftMonth(2026, 1, -13), { year: 2024, month: 12 })
  assert.equal(monthTitle(2026, 10), 'October 2026')
})

test('away: weekends never show, leave spanning a weekend shows Fri and Mon', () => {
  const m = awayByDate([row('a', 'Ann', '2026-10-09', '2026-10-12')]) // Fri - Mon
  assert.deepEqual([...m.keys()].sort(), ['2026-10-09', '2026-10-12'])
  assert.equal(m.get('2026-10-09')![0]!.weight, 1)
  assert.equal(awayByDate([row('a', 'Ann', '2026-10-10', '2026-10-11')]).size, 0) // Sat-Sun only
})

test('away: half days', () => {
  const m = awayByDate([row('a', 'Ann', '2026-10-05', '2026-10-07', true, true)]) // Mon-Wed, both ends half
  assert.equal(m.get('2026-10-05')![0]!.weight, 0.5)
  assert.equal(m.get('2026-10-06')![0]!.weight, 1)
  assert.equal(m.get('2026-10-07')![0]!.weight, 0.5)
  const single = awayByDate([row('a', 'Ann', '2026-10-05', '2026-10-05', true)])
  assert.equal(single.get('2026-10-05')![0]!.weight, 0.5)
})

test('away: two half days on one date merge into one full day for that person', () => {
  const m = awayByDate([
    row('a', 'Ann', '2026-10-05', '2026-10-05', true),
    row('a', 'Ann', '2026-10-05', '2026-10-05', true)
  ])
  assert.equal(m.get('2026-10-05')!.length, 1) // one entry, not two
  assert.equal(m.get('2026-10-05')![0]!.weight, 1)
})

test('away: people are listed alphabetically, ignoring case', () => {
  const m = awayByDate([
    row('c', 'chua@x.com', '2026-10-05', '2026-10-05'),
    row('b', 'Ben Tan', '2026-10-05', '2026-10-05'),
    row('a', 'Ann', '2026-10-05', '2026-10-05'),
    row('d', 'ann', '2026-10-05', '2026-10-05') // same name, different person: both kept
  ])
  assert.deepEqual(m.get('2026-10-05')!.map(p => p.employeeId), ['a', 'd', 'b', 'c'])
})

test('away: nothing in, nothing out', () => {
  assert.equal(awayByDate([]).size, 0)
})
