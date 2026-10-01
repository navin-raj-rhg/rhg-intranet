import { addDaysISO, daysInMonth, isWorkingDay, leaveDayWeights, monthName } from './leaveRules.ts'
import type { ISODate } from './leaveRules.ts'

/**
 * Pure logic behind the team calendar (Step 10.12): which days make up a month
 * grid, and who is away on each. Weeks start on Monday (the working week is
 * Monday to Friday). Kept out of the Vue file so it can be unit tested.
 */

export interface CalendarDay {
  date: ISODate
  /** False for the leading/trailing days that belong to the neighbouring months. */
  inMonth: boolean
  isWeekend: boolean
}

/** One row of the /calendar API: approved leave, with no leave type or reason. */
export interface CalendarRow {
  employeeId: string
  employeeName: string
  startDate: ISODate
  endDate: ISODate
  startHalfDay: boolean
  endHalfDay: boolean
  /** Public holidays this leave skipped when it was applied for. */
  holidays?: ISODate[]
}

export interface AwayPerson {
  employeeId: string
  name: string
  /** 1 = the whole day, 0.5 = half a day. */
  weight: number
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const pad = (n: number) => String(n).padStart(2, '0')

/** Monday = 0 ... Sunday = 6. */
function mondayIndex(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** 'Mon', 'Tue' ... for an ISO date. */
export function weekdayShort(date: ISODate): string {
  return WEEKDAY_LABELS[mondayIndex(date)] ?? ''
}

/** Whole weeks (Monday first) covering the month: 4 to 6 rows of 7 days. */
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const first = `${year}-${pad(month)}-01`
  const offset = mondayIndex(first)
  const weekCount = Math.ceil((offset + daysInMonth(year, month)) / 7)
  const start = addDaysISO(first, -offset)
  const prefix = `${year}-${pad(month)}-`

  const weeks: CalendarDay[][] = []
  for (let w = 0; w < weekCount; w++) {
    const week: CalendarDay[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDaysISO(start, w * 7 + d)
      week.push({ date, inMonth: date.startsWith(prefix), isWeekend: !isWorkingDay(date) })
    }
    weeks.push(week)
  }
  return weeks
}

/** First and last date of the grid: what to ask the API for (at most 42 days). */
export function gridRange(year: number, month: number): { from: ISODate, to: ISODate } {
  const weeks = monthGrid(year, month)
  return { from: weeks[0]![0]!.date, to: weeks[weeks.length - 1]![6]!.date }
}

/** Move by whole months, rolling the year over. */
export function shiftMonth(year: number, month: number, delta: number): { year: number, month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** 'October 2026'. */
export function monthTitle(year: number, month: number): string {
  return `${monthName(month)} ${year}`
}

/**
 * Who is away on each date. Only working days count (a Friday-to-Monday leave
 * shows on Friday and Monday, not on the weekend). Two entries for the same
 * person on the same date - say a morning and an afternoon half day - merge
 * into one (capped at a whole day). People are listed alphabetically.
 */
export function awayByDate(rows: CalendarRow[]): Map<ISODate, AwayPerson[]> {
  const byDate = new Map<ISODate, Map<string, AwayPerson>>()

  for (const row of rows) {
    for (const day of leaveDayWeights(row)) {
      let people = byDate.get(day.date)
      if (!people) {
        people = new Map()
        byDate.set(day.date, people)
      }
      const existing = people.get(row.employeeId)
      if (existing) existing.weight = Math.min(1, existing.weight + day.weight)
      else people.set(row.employeeId, { employeeId: row.employeeId, name: row.employeeName, weight: day.weight })
    }
  }

  const result = new Map<ISODate, AwayPerson[]>()
  for (const [date, people] of byDate) {
    result.set(date, [...people.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.employeeId.localeCompare(b.employeeId)
    ))
  }
  return result
}
