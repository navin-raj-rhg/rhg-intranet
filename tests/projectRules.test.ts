import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addWorkingDaysISO,
  validateTaskLeadTime,
  validateDependencies,
  findDependencyCycle,
  bridgeDependencies,
  isTaskBlocked,
  initialDueDates,
  unlockedByCompletion,
  reopenEffects,
  isTaskOverdue,
  isProjectAtRisk,
  type ProjectTaskLike,
  templateTaskProblems,
  planProjectTasks,
  canChangeTaskStatus,
  taskStatusProblem,
  tidyProjectName,
  type TemplateTaskInput

} from '../shared/utils/projectRules.ts'

// 2026-10-05 is a Monday; 2026-10-09 a Friday; 2026-10-10/11 the weekend.
const t = (
  key: string,
  dependsOn: string[] = [],
  status: ProjectTaskLike['status'] = 'todo',
  leadTimeDays = 2,
  dueDate: string | null = null
): ProjectTaskLike => ({ key, dependsOn, status, leadTimeDays, dueDate })

test('addWorkingDaysISO counts Mon-Fri only', () => {
  assert.equal(addWorkingDaysISO('2026-10-05', 2), '2026-10-07')
  assert.equal(addWorkingDaysISO('2026-10-08', 2), '2026-10-12') // Thu + 2 -> Mon
  assert.equal(addWorkingDaysISO('2026-10-09', 1), '2026-10-12') // Fri + 1 -> Mon
  assert.equal(addWorkingDaysISO('2026-10-05', 5), '2026-10-12')
})

test('addWorkingDaysISO with 0 days: same day if working, else next working day', () => {
  assert.equal(addWorkingDaysISO('2026-10-05', 0), '2026-10-05')
  assert.equal(addWorkingDaysISO('2026-10-10', 0), '2026-10-12') // Saturday
})

test('addWorkingDaysISO skips public holidays', () => {
  assert.equal(addWorkingDaysISO('2026-10-05', 2, ['2026-10-06']), '2026-10-08')
  assert.equal(addWorkingDaysISO('2026-10-05', 0, ['2026-10-05']), '2026-10-06')
  assert.equal(addWorkingDaysISO('2026-10-09', 1, ['2026-10-12']), '2026-10-13')
})

test('validateTaskLeadTime', () => {
  assert.equal(validateTaskLeadTime(0), null)
  assert.equal(validateTaskLeadTime(365), null)
  assert.notEqual(validateTaskLeadTime(-1), null)
  assert.notEqual(validateTaskLeadTime(1.5), null)
  assert.notEqual(validateTaskLeadTime(366), null)
})

test('validateDependencies accepts a clean chain', () => {
  assert.equal(validateDependencies([t('A'), t('B', ['A']), t('C', ['A', 'B'])]), null)
})

test('validateDependencies rejects unknown, self, duplicate and loops', () => {
  assert.match(validateDependencies([t('A', ['Z'])])!, /does not exist/)
  assert.match(validateDependencies([t('A', ['A'])])!, /itself/)
  assert.match(validateDependencies([t('A'), t('A')])!, /twice/)
  assert.match(validateDependencies([t('A', ['B']), t('B', ['A'])])!, /loop/)
})

test('findDependencyCycle returns the loop in order, or null', () => {
  assert.equal(findDependencyCycle([t('A'), t('B', ['A'])]), null)
  assert.deepEqual(findDependencyCycle([t('A', ['C']), t('B', ['A']), t('C', ['B'])]), ['A', 'C', 'B', 'A'])
  // A diamond is not a loop.
  assert.equal(findDependencyCycle([t('A'), t('B', ['A']), t('C', ['A']), t('D', ['B', 'C'])]), null)
})

test('bridgeDependencies skips a left-out task (A -> B -> C without B)', () => {
  const out = bridgeDependencies([t('A'), t('B', ['A']), t('C', ['B'])], new Set(['A', 'C']))
  assert.deepEqual(out.map(n => [n.key, n.dependsOn]), [['A', []], ['C', ['A']]])
})

test('bridgeDependencies bridges several left-out tasks in a row and merges duplicates', () => {
  const nodes = [t('A'), t('B', ['A']), t('X', ['B']), t('Y', ['X', 'B']), t('C', ['Y', 'A'])]
  const out = bridgeDependencies(nodes, new Set(['A', 'C']))
  assert.deepEqual(out.map(n => [n.key, n.dependsOn]), [['A', []], ['C', ['A']]])
})

test('bridgeDependencies leaves a task with nothing before it free', () => {
  const out = bridgeDependencies([t('A'), t('B', ['A']), t('C', ['B'])], new Set(['B', 'C']))
  assert.deepEqual(out.map(n => [n.key, n.dependsOn]), [['B', []], ['C', ['B']]])
})

test('bridgeDependencies keeps everything when nothing is left out, and does not change its input', () => {
  const nodes = [t('A'), t('B', ['A'])]
  const out = bridgeDependencies(nodes, new Set(['A', 'B']))
  assert.deepEqual(out.map(n => n.dependsOn), [[], ['A']])
  bridgeDependencies(nodes, new Set(['A']))
  assert.deepEqual(nodes[1]!.dependsOn, ['A'])
})

test('isTaskBlocked', () => {
  const all = [t('A', [], 'done'), t('B', [], 'in_progress'), t('C', ['A']), t('D', ['A', 'B']), t('E', ['gone'])]
  assert.equal(isTaskBlocked(all[2]!, all), false)
  assert.equal(isTaskBlocked(all[3]!, all), true)
  assert.equal(isTaskBlocked(all[4]!, all), false) // a missing task doesn't block
})

test('initialDueDates: free tasks get start + lead time, blocked tasks none', () => {
  const tasks = [t('A', [], 'todo', 3), t('B', ['A'], 'todo', 2), t('C', [], 'todo', 0)]
  assert.deepEqual(initialDueDates(tasks, '2026-10-05'), [
    { key: 'A', dueDate: '2026-10-08' },
    { key: 'B', dueDate: null },
    { key: 'C', dueDate: '2026-10-05' }
  ])
})

test('unlockedByCompletion gives the dependent completion day + lead time', () => {
  const tasks = [t('A', [], 'done'), t('B', ['A'], 'todo', 3)]
  assert.deepEqual(unlockedByCompletion(tasks, 'A', '2026-10-08'), [{ key: 'B', dueDate: '2026-10-13' }])
})

test('unlockedByCompletion waits for the LAST predecessor', () => {
  const tasks = [t('A', [], 'done'), t('B', [], 'todo'), t('C', ['A', 'B'])]
  assert.deepEqual(unlockedByCompletion(tasks, 'A', '2026-10-05'), [])
  const after = [t('A', [], 'done'), t('B', [], 'done'), t('C', ['A', 'B'], 'todo', 1)]
  assert.deepEqual(unlockedByCompletion(after, 'B', '2026-10-06'), [{ key: 'C', dueDate: '2026-10-07' }])
})

test('unlockedByCompletion ignores tasks that are done or unrelated, and respects holidays', () => {
  const tasks = [t('A', [], 'done'), t('B', ['A'], 'done'), t('C', [], 'todo'), t('D', ['A'], 'in_progress', 1)]
  assert.deepEqual(unlockedByCompletion(tasks, 'A', '2026-10-05', ['2026-10-06']), [
    { key: 'D', dueDate: '2026-10-07' }
  ])
})

test('reopenEffects: unstarted dependents re-block, started ones only warn', () => {
  const tasks = [
    t('A', [], 'todo'),
    t('B', ['A'], 'todo', 2, '2026-10-08'),
    t('C', ['A'], 'in_progress', 2, '2026-10-08'),
    t('D', ['A'], 'done', 2, '2026-10-08'),
    t('E', ['B'], 'todo')
  ]
  assert.deepEqual(reopenEffects(tasks, 'A'), { reblocked: ['B'], warn: ['C', 'D'] })
})

test('isTaskOverdue', () => {
  assert.equal(isTaskOverdue({ status: 'todo', dueDate: '2026-10-01' }, '2026-10-05'), true)
  assert.equal(isTaskOverdue({ status: 'todo', dueDate: '2026-10-05' }, '2026-10-05'), false)
  assert.equal(isTaskOverdue({ status: 'done', dueDate: '2026-10-01' }, '2026-10-05'), false)
  assert.equal(isTaskOverdue({ status: 'todo', dueDate: null }, '2026-10-05'), false)
})

test('isProjectAtRisk: overdue or due after the target date', () => {
  const today = '2026-10-05'
  assert.equal(isProjectAtRisk([{ status: 'todo', dueDate: '2026-10-01' }], null, today), true)
  assert.equal(isProjectAtRisk([{ status: 'todo', dueDate: '2026-10-20' }], '2026-10-15', today), true)
  assert.equal(isProjectAtRisk([{ status: 'todo', dueDate: '2026-10-10' }], '2026-10-15', today), false)
  assert.equal(isProjectAtRisk([{ status: 'todo', dueDate: '2026-10-20' }], null, today), false)
  assert.equal(isProjectAtRisk([{ status: 'done', dueDate: '2026-10-01' }, { status: 'todo', dueDate: null }], '2026-10-15', today), false)
})

const m = (
  key: string,
  dependsOn: string[] = [],
  typeIds: number[] = [1, 2],
  leadTimeDays = 2,
  active = true
): TemplateTaskInput => ({
  key, dependsOn, typeIds, leadTimeDays, active, title: `Task ${key}`, description: null, sectionId: null, assigneeId: null
})

test('tidyProjectName collapses spaces', () => {
  assert.equal(tidyProjectName('  Spring   launch \n '), 'Spring launch')
})

test('templateTaskProblems: fine list, missing title, bad lead time, loop', () => {
  assert.deepEqual(templateTaskProblems([m('A'), m('B', ['A'])]), [])
  assert.match(templateTaskProblems([{ ...m('A'), title: '  ' }])[0]!, /needs a title/)
  assert.match(templateTaskProblems([m('A', [], [1], -3)])[0]!, /Lead Time/)
  assert.match(templateTaskProblems([m('A', ['B']), m('B', ['A'])]).join(' '), /loop/)
})

test('planProjectTasks: only ticked tasks, links bridged, first dates set', () => {
  const master = [m('A', [], [1, 2], 1), m('B', ['A'], [1], 2), m('C', ['B'], [1, 2], 3)]
  const live = planProjectTasks(master, 1, '2026-10-05')
  assert.deepEqual(live.map(t => [t.key, t.dependsOn, t.dueDate]), [
    ['A', [], '2026-10-06'],
    ['B', ['A'], null],
    ['C', ['B'], null]
  ])
  const promo = planProjectTasks(master, 2, '2026-10-05')
  assert.deepEqual(promo.map(t => [t.key, t.dependsOn, t.dueDate]), [
    ['A', [], '2026-10-06'],
    ['C', ['A'], null]
  ])
})

test('planProjectTasks: inactive tasks are left out and bridged, blank projects get nothing', () => {
  const master = [m('A'), m('B', ['A'], [1], 2, false), m('C', ['B'])]
  assert.deepEqual(planProjectTasks(master, 1, '2026-10-05').map(t => [t.key, t.dependsOn]), [['A', []], ['C', ['A']]])
  assert.deepEqual(planProjectTasks(master, null, '2026-10-05'), [])
})

test('planProjectTasks skips holidays in first due dates', () => {
  const out = planProjectTasks([m('A', [], [1], 1)], 1, '2026-10-05', ['2026-10-06'])
  assert.equal(out[0]!.dueDate, '2026-10-07')
})

test('canChangeTaskStatus: assignee, project owner, admin only', () => {
  const base = { userId: 'u1', assigneeId: 'u2', projectOwnerId: 'u3', isAdmin: false }
  assert.equal(canChangeTaskStatus(base), false)
  assert.equal(canChangeTaskStatus({ ...base, userId: 'u2' }), true)
  assert.equal(canChangeTaskStatus({ ...base, userId: 'u3' }), true)
  assert.equal(canChangeTaskStatus({ ...base, isAdmin: true }), true)
})

test('taskStatusProblem: a blocked task cannot be started or finished', () => {
  assert.match(taskStatusProblem('todo', 'in_progress', true)!, /waiting/)
  assert.match(taskStatusProblem('todo', 'done', true)!, /waiting/)
  assert.equal(taskStatusProblem('todo', 'in_progress', false), null)
  assert.equal(taskStatusProblem('todo', 'todo', true), null)
})

test('planProjectTasks carries the section name and position of each task', () => {
  const master = [{ ...m('A'), sectionId: 2 }, { ...m('B', ['A']), sectionId: 1 }, m('C', ['B'])]
  const sections = [{ id: 1, name: 'Quality', sortOrder: 0 }, { id: 2, name: 'Marketing', sortOrder: 1 }]
  const out = planProjectTasks(master, 1, '2026-10-05', [], sections)
  assert.deepEqual(out.map(t => [t.key, t.sectionName, t.sectionOrder]), [
    ['A', 'Marketing', 1],
    ['B', 'Quality', 0],
    ['C', null, 1000000]
  ])
})
