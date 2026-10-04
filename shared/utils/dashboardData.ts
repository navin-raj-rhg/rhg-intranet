/**
 * Rules for the dashboard charts (Step 19): reading the uploaded sales and
 * goals CSV files, checking them, and working out the figures the tiles show.
 * Pure logic - no database, no Vue. Dates are ISO 'YYYY-MM-DD'; a goal's
 * period is a month, 'YYYY-MM'.
 */
import { parsePimCsv, buildPimCsv } from './pimRules.ts'
import { parseDateMY } from './dates.ts'

export const DASHBOARD_MAX_ROWS = 50000
export const DASHBOARD_MAX_PROBLEMS = 20
export const DASHBOARD_TEXT_MAX = 120

export const SALES_CSV_COLUMNS = ['Date', 'Customer', 'Category', 'State', 'Amount', 'Quantity'] as const
export const GOALS_CSV_COLUMNS = ['Goal', 'Month', 'Target', 'Actual', 'Unit'] as const

export interface SalesRow {
  date: string
  customer: string | null
  category: string | null
  state: string | null
  amount: number
  quantity: number | null
}

export interface GoalRow {
  goal: string
  period: string
  target: number
  actual: number
  unit: string | null
}

export interface ParsedUpload<T> {
  rows: T[]
  problems: string[]
}

// ---------------------------------------------------------------- reading

function isRealIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/** A date typed as 2026-03-05 or 05/03/2026 (day first), or null. */
export function readUploadDate(text: string): string | null {
  const t = text.trim()
  if (isRealIsoDate(t)) return t
  return parseDateMY(t)
}

/** A month typed as 2026-03, 03/2026, or any full date (its month is used), or null. */
export function readUploadMonth(text: string): string | null {
  const t = text.trim()
  let m = /^(\d{4})-(\d{1,2})$/.exec(t)
  if (m) return monthKey(Number(m[1]), Number(m[2]))
  m = /^(\d{1,2})\/(\d{4})$/.exec(t)
  if (m) return monthKey(Number(m[2]), Number(m[1]))
  const d = readUploadDate(t)
  return d ? d.slice(0, 7) : null
}

function monthKey(year: number, month: number): string | null {
  if (month < 1 || month > 12 || year < 1900 || year > 2200) return null
  return `${year}-${String(month).padStart(2, '0')}`
}

/** A number typed with optional $ , and spaces, or null. Negatives allowed (credits). */
export function readUploadNumber(text: string): number | null {
  const t = text.trim().replace(/[$,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function headerIndex(header: string[], name: string): number {
  return header.findIndex(h => h.trim().toLowerCase() === name.toLowerCase())
}

function optionalText(cells: string[], idx: number): string | null {
  if (idx < 0) return null
  const v = (cells[idx] ?? '').trim()
  return v ? v : null
}

function checkHeader(header: string[], required: readonly string[]): string {
  const missing = required.filter(c => headerIndex(header, c) < 0)
  return missing.length ? `The file is missing the column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}` : ''
}

/** Turns an uploaded sales CSV into checked rows. Required columns: Date, Amount. */
export function parseSalesCsv(text: string): ParsedUpload<SalesRow> {
  const table = parsePimCsv(text)
  if (table.length === 0) return { rows: [], problems: ['The file is empty'] }
  const header = table[0]!
  const bad = checkHeader(header, ['Date', 'Amount'])
  if (bad) return { rows: [], problems: [bad] }
  if (table.length - 1 > DASHBOARD_MAX_ROWS) return { rows: [], problems: [`The file has more than ${DASHBOARD_MAX_ROWS} rows`] }
  const iDate = headerIndex(header, 'Date')
  const iAmount = headerIndex(header, 'Amount')
  const iCustomer = headerIndex(header, 'Customer')
  const iCategory = headerIndex(header, 'Category')
  const iState = headerIndex(header, 'State')
  const iQty = headerIndex(header, 'Quantity')
  const rows: SalesRow[] = []
  const problems: string[] = []
  const fail = (line: number, msg: string) => {
    if (problems.length < DASHBOARD_MAX_PROBLEMS) problems.push(`Row ${line}: ${msg}`)
  }
  for (let i = 1; i < table.length; i++) {
    const cells = table[i]!
    const line = i + 1
    const date = readUploadDate(cells[iDate] ?? '')
    if (!date) {
      fail(line, 'the date is not valid (use 2026-03-05 or 05/03/2026)')
      continue
    }
    const amount = readUploadNumber(cells[iAmount] ?? '')
    if (amount === null) {
      fail(line, 'the amount is not a number')
      continue
    }
    let quantity: number | null = null
    const qtyText = iQty >= 0 ? (cells[iQty] ?? '').trim() : ''
    if (qtyText) {
      quantity = readUploadNumber(qtyText)
      if (quantity === null) {
        fail(line, 'the quantity is not a number')
        continue
      }
    }
    const customer = optionalText(cells, iCustomer)
    const category = optionalText(cells, iCategory)
    const state = optionalText(cells, iState)
    if ([customer, category, state].some(v => v && v.length > DASHBOARD_TEXT_MAX)) {
      fail(line, `text must be ${DASHBOARD_TEXT_MAX} characters or fewer`)
      continue
    }
    rows.push({ date, customer, category, state, amount, quantity })
  }
  if (problems.length === 0 && rows.length === 0) problems.push('The file has no sales rows')
  return { rows: problems.length ? [] : rows, problems }
}

/** Turns an uploaded goals CSV into checked rows. Required columns: Goal, Month, Target, Actual. */
export function parseGoalsCsv(text: string): ParsedUpload<GoalRow> {
  const table = parsePimCsv(text)
  if (table.length === 0) return { rows: [], problems: ['The file is empty'] }
  const header = table[0]!
  const bad = checkHeader(header, ['Goal', 'Month', 'Target', 'Actual'])
  if (bad) return { rows: [], problems: [bad] }
  if (table.length - 1 > DASHBOARD_MAX_ROWS) return { rows: [], problems: [`The file has more than ${DASHBOARD_MAX_ROWS} rows`] }
  const iGoal = headerIndex(header, 'Goal')
  const iMonth = headerIndex(header, 'Month')
  const iTarget = headerIndex(header, 'Target')
  const iActual = headerIndex(header, 'Actual')
  const iUnit = headerIndex(header, 'Unit')
  const rows: GoalRow[] = []
  const problems: string[] = []
  const seen = new Set<string>()
  const fail = (line: number, msg: string) => {
    if (problems.length < DASHBOARD_MAX_PROBLEMS) problems.push(`Row ${line}: ${msg}`)
  }
  for (let i = 1; i < table.length; i++) {
    const cells = table[i]!
    const line = i + 1
    const goal = (cells[iGoal] ?? '').trim()
    if (!goal) {
      fail(line, 'the goal name is blank')
      continue
    }
    if (goal.length > DASHBOARD_TEXT_MAX) {
      fail(line, `the goal name must be ${DASHBOARD_TEXT_MAX} characters or fewer`)
      continue
    }
    const period = readUploadMonth(cells[iMonth] ?? '')
    if (!period) {
      fail(line, 'the month is not valid (use 2026-03)')
      continue
    }
    const target = readUploadNumber(cells[iTarget] ?? '')
    if (target === null || target < 0) {
      fail(line, 'the target must be a number of zero or more')
      continue
    }
    const actual = readUploadNumber(cells[iActual] ?? '')
    if (actual === null) {
      fail(line, 'the actual is not a number')
      continue
    }
    const key = `${goal.toLowerCase()}|${period}`
    if (seen.has(key)) {
      fail(line, `"${goal}" appears twice for ${period}`)
      continue
    }
    seen.add(key)
    rows.push({ goal, period, target, actual, unit: optionalText(cells, iUnit) })
  }
  if (problems.length === 0 && rows.length === 0) problems.push('The file has no goal rows')
  return { rows: problems.length ? [] : rows, problems }
}

/** Starter files people can fill in: the header plus an example row. */
export function salesCsvTemplate(): string {
  return buildPimCsv([['2026-03-05', 'Example Customer', 'Hand tools', 'VIC', 1250.5, 40]], SALES_CSV_COLUMNS)
}

export function goalsCsvTemplate(): string {
  return buildPimCsv([['Sales', '2026-03', 100000, 87500, 'AUD']], GOALS_CSV_COLUMNS)
}

// ---------------------------------------------------------------- figures

export interface MonthlyPoint {
  month: number // 1-12
  thisYear: number
  lastYear: number
}

export interface RankedItem {
  label: string
  amount: number
}

export interface SalesSummary {
  year: number
  months: MonthlyPoint[]
  /** Sales from 1 January up to `today`, and the same stretch of last year. */
  yearToDate: number
  lastYearToDate: number
  /** Percent change against last year's same stretch; null when last year had no sales. */
  changePercent: number | null
  topCustomers: RankedItem[]
  topCategories: RankedItem[]
  rowCount: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function topBy(rows: SalesRow[], pick: (r: SalesRow) => string | null, limit: number): RankedItem[] {
  const totals = new Map<string, number>()
  for (const r of rows) {
    const label = pick(r)
    if (label) totals.set(label, (totals.get(label) ?? 0) + r.amount)
  }
  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
    .slice(0, limit)
}

/**
 * Figures for the Sales overview tile. "This year" is the year of `today`.
 * Top customers / categories cover this year to date.
 */
export function salesSummary(rows: SalesRow[], today: string, topCount = 5): SalesSummary {
  const year = Number(today.slice(0, 4))
  const monthDay = today.slice(5)
  const months: MonthlyPoint[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, thisYear: 0, lastYear: 0 }))
  let ytd = 0
  let lastYtd = 0
  const thisYearRows: SalesRow[] = []
  for (const r of rows) {
    const y = Number(r.date.slice(0, 4))
    const m = Number(r.date.slice(5, 7))
    if (y === year) {
      months[m - 1]!.thisYear += r.amount
      if (r.date.slice(5) <= monthDay) {
        ytd += r.amount
        thisYearRows.push(r)
      }
    } else if (y === year - 1) {
      months[m - 1]!.lastYear += r.amount
      if (r.date.slice(5) <= monthDay) lastYtd += r.amount
    }
  }
  for (const p of months) {
    p.thisYear = round2(p.thisYear)
    p.lastYear = round2(p.lastYear)
  }
  return {
    year,
    months,
    yearToDate: round2(ytd),
    lastYearToDate: round2(lastYtd),
    changePercent: lastYtd > 0 ? Math.round(((ytd - lastYtd) / lastYtd) * 1000) / 10 : null,
    topCustomers: topBy(thisYearRows, r => r.customer, topCount),
    topCategories: topBy(thisYearRows, r => r.category, topCount),
    rowCount: rows.length
  }
}

export interface GoalProgress {
  goal: string
  unit: string | null
  /** The most recent month with a row, up to and including today's month when there is one. */
  period: string
  target: number
  actual: number
  /** actual / target as a whole percent; null when the target is 0. */
  percent: number | null
  /** Every month on file, oldest first, for a small trend chart. */
  history: { period: string, target: number, actual: number }[]
}

/**
 * One progress line per goal, using each goal's latest month that is not in
 * the future (falling back to its earliest month if all are in the future).
 * Goals are listed alphabetically.
 */
export function goalsSummary(rows: GoalRow[], today: string): GoalProgress[] {
  const thisMonth = today.slice(0, 7)
  const byGoal = new Map<string, GoalRow[]>()
  for (const r of rows) {
    const list = byGoal.get(r.goal) ?? []
    list.push(r)
    byGoal.set(r.goal, list)
  }
  const out: GoalProgress[] = []
  for (const [goal, list] of byGoal) {
    const sorted = [...list].sort((a, b) => a.period.localeCompare(b.period))
    const current = [...sorted].reverse().find(r => r.period <= thisMonth) ?? sorted[0]!
    out.push({
      goal,
      unit: current.unit,
      period: current.period,
      target: current.target,
      actual: current.actual,
      percent: current.target > 0 ? Math.round((current.actual / current.target) * 100) : null,
      history: sorted.map(r => ({ period: r.period, target: r.target, actual: r.actual }))
    })
  }
  return out.sort((a, b) => a.goal.localeCompare(b.goal))
}

// ------------------------------------------------------- project overview

export interface OverviewProject {
  id: number
  name: string
  targetDate: string | null
  atRisk: boolean
  overdueTasks: number
  openTasks: number
}

export interface ProjectOverview {
  /** 'all' for admins and the owner, 'mine' for everyone else. */
  scope: 'all' | 'mine'
  openProjects: number
  atRiskProjects: number
  overdueTasks: number
  tasks: { todo: number, inProgress: number, done: number }
  /** The most at-risk open projects, worst first. */
  atRiskList: OverviewProject[]
}

export const PROJECT_OVERVIEW_LIST_SIZE = 5

/**
 * Figures for the Project overview tile from the caller's open projects and the
 * number of their tasks in each status.
 */
export function projectOverviewSummary(
  scope: 'all' | 'mine',
  openProjects: OverviewProject[],
  taskCounts: { todo: number, in_progress: number, done: number }
): ProjectOverview {
  const atRisk = openProjects
    .filter(p => p.atRisk)
    .sort((a, b) => b.overdueTasks - a.overdueTasks || a.name.localeCompare(b.name))
  return {
    scope,
    openProjects: openProjects.length,
    atRiskProjects: atRisk.length,
    overdueTasks: openProjects.reduce((sum, p) => sum + p.overdueTasks, 0),
    tasks: { todo: taskCounts.todo, inProgress: taskCounts.in_progress, done: taskCounts.done },
    atRiskList: atRisk.slice(0, PROJECT_OVERVIEW_LIST_SIZE).map(p => ({
      id: p.id,
      name: p.name,
      targetDate: p.targetDate,
      atRisk: p.atRisk,
      overdueTasks: p.overdueTasks,
      openTasks: p.openTasks
    }))
  }
}
