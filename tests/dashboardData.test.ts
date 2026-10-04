import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readUploadDate, readUploadMonth, readUploadNumber, parseSalesCsv, parseGoalsCsv,
  salesCsvTemplate, goalsCsvTemplate, salesSummary, goalsSummary, projectOverviewSummary, type SalesRow
} from '../shared/utils/dashboardData.ts'

test('dates, months and numbers are read leniently but not guessed', () => {
  assert.equal(readUploadDate('2026-03-05'), '2026-03-05')
  assert.equal(readUploadDate('05/03/2026'), '2026-03-05')
  assert.equal(readUploadDate('2026-02-31'), null)
  assert.equal(readUploadDate('March'), null)
  assert.equal(readUploadMonth('2026-3'), '2026-03')
  assert.equal(readUploadMonth('03/2026'), '2026-03')
  assert.equal(readUploadMonth('15/03/2026'), '2026-03')
  assert.equal(readUploadMonth('2026-13'), null)
  assert.equal(readUploadNumber('$1,250.50'), 1250.5)
  assert.equal(readUploadNumber('-20'), -20)
  assert.equal(readUploadNumber('abc'), null)
  assert.equal(readUploadNumber(''), null)
})

test('a sales file is read, with optional columns', () => {
  const r = parseSalesCsv('Date,Amount,Customer\n2026-01-05,100,Acme\n06/01/2026,"1,000",\n')
  assert.deepEqual(r.problems, [])
  assert.equal(r.rows.length, 2)
  assert.equal(r.rows[1]!.amount, 1000)
  assert.equal(r.rows[1]!.customer, null)
  assert.equal(r.rows[0]!.category, null)
})

test('sales file problems are reported by row, and nothing is returned', () => {
  const r = parseSalesCsv('Date,Amount,Quantity\nnope,1,\n2026-01-01,x,\n2026-01-02,5,y\n2026-01-03,5,2\n')
  assert.equal(r.rows.length, 0)
  assert.equal(r.problems.length, 3)
  assert.match(r.problems[0]!, /^Row 2/)
  assert.match(r.problems[2]!, /^Row 4/)
  assert.ok(parseSalesCsv('Date,Customer\n2026-01-01,A').problems[0]!.includes('Amount'))
  assert.ok(parseSalesCsv('').problems.length)
  assert.ok(parseSalesCsv('Date,Amount\n').problems.length)
})

test('a goals file is read and checked', () => {
  const r = parseGoalsCsv('Goal,Month,Target,Actual,Unit\nSales,2026-03,100,87.5,AUD\nSales,2026-04,100,0,\n')
  assert.deepEqual(r.problems, [])
  assert.equal(r.rows.length, 2)
  assert.equal(r.rows[1]!.unit, null)
  assert.ok(parseGoalsCsv('Goal,Month,Target,Actual\n,2026-03,1,1').problems.length)
  assert.ok(parseGoalsCsv('Goal,Month,Target,Actual\nA,2026-03,-1,1').problems.length)
  assert.ok(parseGoalsCsv('Goal,Month,Target,Actual\nA,2026-03,1,1\na,2026-03,2,2').problems[0]!.includes('twice'))
  assert.ok(parseGoalsCsv('Goal,Month\nA,2026-03').problems[0]!.includes('Target'))
})

test('the templates read back cleanly', () => {
  assert.deepEqual(parseSalesCsv(salesCsvTemplate()).problems, [])
  assert.deepEqual(parseGoalsCsv(goalsCsvTemplate()).problems, [])
})

const sale = (date: string, amount: number, customer: string | null = null, category: string | null = null): SalesRow =>
  ({ date, customer, category, state: null, amount, quantity: null })

test('sales summary: months, year to date and change', () => {
  const rows = [
    sale('2025-01-10', 100, 'A', 'X'),
    sale('2025-03-01', 100, 'A'), // after today's month-day: not in last year's to-date
    sale('2026-01-10', 150, 'A', 'X'),
    sale('2026-02-01', 50, 'B', 'Y'),
    sale('2026-02-20', -10, 'B', 'Y'),
    sale('2026-06-01', 999, 'C') // in the future: not to date
  ]
  const s = salesSummary(rows, '2026-02-28')
  assert.equal(s.year, 2026)
  assert.equal(s.months[0]!.thisYear, 150)
  assert.equal(s.months[0]!.lastYear, 100)
  assert.equal(s.months[1]!.thisYear, 40)
  assert.equal(s.yearToDate, 190)
  assert.equal(s.lastYearToDate, 100)
  assert.equal(s.changePercent, 90)
  assert.deepEqual(s.topCustomers, [{ label: 'A', amount: 150 }, { label: 'B', amount: 40 }])
  assert.deepEqual(s.topCategories.map(c => c.label), ['X', 'Y'])
  assert.equal(s.rowCount, 6)
})

test('sales summary with no last year has no percentage and an empty file is safe', () => {
  assert.equal(salesSummary([sale('2026-01-01', 5)], '2026-02-01').changePercent, null)
  const e = salesSummary([], '2026-02-01')
  assert.equal(e.yearToDate, 0)
  assert.equal(e.months.length, 12)
})

test('top lists are capped and ties sorted by name', () => {
  const rows = ['f', 'e', 'd', 'c', 'b', 'a'].map(c => sale('2026-01-01', 10, c))
  assert.deepEqual(salesSummary(rows, '2026-02-01').topCustomers.map(c => c.label), ['a', 'b', 'c', 'd', 'e'])
})

test('goals summary uses each goal\'s latest month that has started', () => {
  const rows = parseGoalsCsv([
    'Goal,Month,Target,Actual,Unit',
    'Sales,2026-01,100,50,AUD',
    'Sales,2026-02,100,87,AUD',
    'Sales,2026-09,100,0,AUD',
    'Margin,2026-12,40,0,%',
    'Zero,2026-01,0,5,'
  ].join('\n')).rows
  const g = goalsSummary(rows, '2026-02-15')
  assert.deepEqual(g.map(x => x.goal), ['Margin', 'Sales', 'Zero'])
  assert.equal(g[1]!.period, '2026-02')
  assert.equal(g[1]!.percent, 87)
  assert.equal(g[1]!.history.length, 3)
  assert.equal(g[0]!.period, '2026-12') // only a future month: falls back to it
  assert.equal(g[2]!.percent, null)
})

test('project overview counts and ranks at-risk projects', () => {
  const p = (id: number, name: string, atRisk: boolean, overdueTasks: number) =>
    ({ id, name, targetDate: null, atRisk, overdueTasks, openTasks: 3 })
  const o = projectOverviewSummary('mine', [p(1, 'B', true, 1), p(2, 'A', true, 1), p(3, 'C', true, 4), p(4, 'D', false, 0)],
    { todo: 5, in_progress: 2, done: 9 })
  assert.equal(o.openProjects, 4)
  assert.equal(o.atRiskProjects, 3)
  assert.equal(o.overdueTasks, 6)
  assert.deepEqual(o.tasks, { todo: 5, inProgress: 2, done: 9 })
  assert.deepEqual(o.atRiskList.map(x => x.name), ['C', 'A', 'B'])
  assert.deepEqual(Object.keys(o.atRiskList[0]!).sort(), ['atRisk', 'id', 'name', 'openTasks', 'overdueTasks', 'targetDate'])
  const many = Array.from({ length: 8 }, (_, i) => p(i, `P${i}`, true, 1))
  assert.equal(projectOverviewSummary('all', many, { todo: 0, in_progress: 0, done: 0 }).atRiskList.length, 5)
})
