/**
 * Project rules (Step 16): dependencies between tasks and the due dates they
 * hand out. Pure logic - no database, no Vue - so the server and the screens
 * use the same code and it is unit tested in tests/projectRules.test.ts.
 *
 * Key ideas:
 * - A task is BLOCKED while any task it depends on is not Done. A blocked task
 *   has no due date.
 * - When the last task it waits for is completed, it unlocks and gets
 *   due date = completion day + its lead time in WORKING days (Mon-Fri, public
 *   holidays skipped).
 * - A task with nothing to wait for gets its date from the project start date.
 * - A project type can leave tasks out; links are bridged over the left-out
 *   tasks so chains never break (A -> B -> C without B becomes A -> C).
 */
import { addDaysISO, isWorkingDay } from './leaveRules.ts'

export type ProjectTaskStatus = 'todo' | 'in_progress' | 'done'

/** The part of a task these rules need. `key` is any stable id (template key or task id). */
export interface DependencyNode {
  key: string
  dependsOn: string[]
}

export interface ProjectTaskLike extends DependencyNode {
  status: ProjectTaskStatus
  /** Lead Time: working days allowed once the task unlocks. 0 = due the day it unlocks. */
  leadTimeDays: number
  /** ISO date, or null while blocked. */
  dueDate: string | null
}

export const MAX_TASK_LEAD_TIME_DAYS = 365

/* ------------------------------------------------------------------ */
/* Working days                                                        */
/* ------------------------------------------------------------------ */

/**
 * The date `days` working days after `from`, skipping weekends and the given
 * public holidays. With 0 days it returns `from` itself if that is a working
 * day, otherwise the next working day (a task can't fall due on a Sunday).
 */
export function addWorkingDaysISO(from: string, days: number, holidays: string[] = []): string {
  const off = new Set(holidays)
  const open = (iso: string) => isWorkingDay(iso) && !off.has(iso)
  let date = from
  let left = Math.max(0, Math.floor(days))
  while (left > 0) {
    date = addDaysISO(date, 1)
    if (open(date)) left--
  }
  while (!open(date)) date = addDaysISO(date, 1)
  return date
}

/** Why a lead time can't be used, or null if it is fine (whole days, 0 to 365). */
export function validateTaskLeadTime(days: number): string | null {
  if (!Number.isInteger(days) || days < 0 || days > MAX_TASK_LEAD_TIME_DAYS) {
    return `Lead Time must be a whole number of working days from 0 to ${MAX_TASK_LEAD_TIME_DAYS}.`
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Checking and bridging links                                         */
/* ------------------------------------------------------------------ */

/** The first problem with the links (unknown task, linked to itself, duplicate key, or a loop), or null. */
export function validateDependencies(nodes: DependencyNode[]): string | null {
  const keys = new Set<string>()
  for (const n of nodes) {
    if (keys.has(n.key)) return `Task "${n.key}" appears twice.`
    keys.add(n.key)
  }
  for (const n of nodes) {
    for (const dep of n.dependsOn) {
      if (dep === n.key) return `Task "${n.key}" cannot depend on itself.`
      if (!keys.has(dep)) return `Task "${n.key}" depends on "${dep}", which does not exist.`
    }
  }
  const loop = findDependencyCycle(nodes)
  return loop ? `Tasks wait for each other in a loop: ${loop.join(' -> ')}.` : null
}

/**
 * A loop of tasks that wait for each other, as the keys in order with the
 * first repeated at the end (['A', 'B', 'A']), or null if there is none.
 * Links to tasks that aren't in the list are ignored here.
 */
export function findDependencyCycle(nodes: DependencyNode[]): string[] | null {
  const deps = new Map(nodes.map(n => [n.key, n.dependsOn]))
  const state = new Map<string, 'visiting' | 'done'>()
  const path: string[] = []

  function visit(key: string): string[] | null {
    state.set(key, 'visiting')
    path.push(key)
    for (const dep of deps.get(key) ?? []) {
      if (!deps.has(dep)) continue
      if (state.get(dep) === 'visiting') return [...path.slice(path.indexOf(dep)), dep]
      if (!state.has(dep)) {
        const found = visit(dep)
        if (found) return found
      }
    }
    path.pop()
    state.set(key, 'done')
    return null
  }

  for (const n of nodes) {
    if (!state.has(n.key)) {
      const found = visit(n.key)
      if (found) return found
    }
  }
  return null
}

/**
 * Keeps only the tasks in `included` (in their original order) and rewrites
 * each one's links so they skip over left-out tasks: if C waits for B and B is
 * left out, C waits for whatever B waited for. Duplicates are removed.
 */
export function bridgeDependencies<T extends DependencyNode>(nodes: T[], included: Set<string>): T[] {
  const byKey = new Map(nodes.map(n => [n.key, n]))

  function resolve(key: string, seen: Set<string>): string[] {
    if (included.has(key)) return [key]
    if (seen.has(key)) return []
    seen.add(key)
    return (byKey.get(key)?.dependsOn ?? []).flatMap(d => resolve(d, seen))
  }

  return nodes
    .filter(n => included.has(n.key))
    .map(n => ({
      ...n,
      dependsOn: [...new Set(n.dependsOn.flatMap(d => resolve(d, new Set([n.key]))))]
        .filter(d => d !== n.key)
    }))
}

/* ------------------------------------------------------------------ */
/* Blocking, unlocking and due dates                                   */
/* ------------------------------------------------------------------ */

/** True while any task this one depends on is not Done. A dependency that no longer exists doesn't block. */
export function isTaskBlocked(task: DependencyNode, all: Pick<ProjectTaskLike, 'key' | 'status'>[]): boolean {
  const status = new Map(all.map(t => [t.key, t.status]))
  return task.dependsOn.some(d => status.has(d) && status.get(d) !== 'done')
}

/**
 * Due dates when a project is first created: a task with nothing to wait for
 * is due `leadTimeDays` working days after the start date; every blocked task
 * has no date yet. Returns one entry per task, in order.
 */
export function initialDueDates(
  tasks: ProjectTaskLike[],
  startDate: string,
  holidays: string[] = []
): { key: string, dueDate: string | null }[] {
  return tasks.map(t => ({
    key: t.key,
    dueDate: t.status !== 'done' && !isTaskBlocked(t, tasks)
      ? addWorkingDaysISO(startDate, t.leadTimeDays, holidays)
      : null
  }))
}

/**
 * Called when a task has just been marked Done (`tasks` already shows it as
 * Done). Returns the tasks that are now free to start, each with its new due
 * date (completion day + its Lead Time in working days). Tasks that are Done,
 * or still waiting for something else, are not returned. A task that was
 * already unlocked (it didn't depend on the completed one) is left alone.
 */
export function unlockedByCompletion(
  tasks: ProjectTaskLike[],
  completedKey: string,
  completedOn: string,
  holidays: string[] = []
): { key: string, dueDate: string }[] {
  return tasks
    .filter(t => t.status !== 'done' && t.dependsOn.includes(completedKey) && !isTaskBlocked(t, tasks))
    .map(t => ({ key: t.key, dueDate: addWorkingDaysISO(completedOn, t.leadTimeDays, holidays) }))
}

/**
 * Called when a Done task is reopened (`tasks` already shows it as not Done).
 * Direct dependents that haven't been started go back to Blocked and lose their
 * due date (`reblocked`). Dependents already In progress or Done are left as
 * they are and listed in `warn` so the screen can say so.
 */
export function reopenEffects(
  tasks: ProjectTaskLike[],
  reopenedKey: string
): { reblocked: string[], warn: string[] } {
  const dependents = tasks.filter(t => t.dependsOn.includes(reopenedKey))
  return {
    reblocked: dependents.filter(t => t.status === 'todo').map(t => t.key),
    warn: dependents.filter(t => t.status !== 'todo').map(t => t.key)
  }
}

/* ------------------------------------------------------------------ */
/* Overdue and "at risk"                                               */
/* ------------------------------------------------------------------ */

/** Not Done and past its due date. Blocked tasks (no date) are never overdue. */
export function isTaskOverdue(task: Pick<ProjectTaskLike, 'status' | 'dueDate'>, today: string): boolean {
  return task.status !== 'done' && task.dueDate !== null && task.dueDate < today
}

/**
 * A simple warning flag, not a forecast: a project is "at risk" if any open
 * task is overdue, or any open task is already due after the target date.
 * Blocked tasks have no date yet and can't be judged. Dates still come only
 * from completions - the target date never moves them.
 */
export function isProjectAtRisk(
  tasks: Pick<ProjectTaskLike, 'status' | 'dueDate'>[],
  targetDate: string | null,
  today: string
): boolean {
  return tasks.some(t =>
    t.status !== 'done'
    && t.dueDate !== null
    && (t.dueDate < today || (targetDate !== null && t.dueDate > targetDate))
  )
}

/* ------------------------------------------------------------------ */
/* Master task list and starting a project                             */
/* ------------------------------------------------------------------ */

/** Sort position of tasks with no section: after every real section. */
export const NO_SECTION_ORDER = 1000000

export const PROJECT_NAME_MAX = 120
export const PROJECT_TITLE_MAX = 200
export const PROJECT_TEXT_MAX = 4000

/** Trims, and collapses runs of spaces/newlines inside a one-line name. */
export function tidyProjectName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/** A master-list task as saved by the admin screen. `key` is any id unique within the list. */
export interface TemplateTaskInput extends DependencyNode {
  title: string
  description: string | null
  /** Null = no section. */
  sectionId: number | null
  assigneeId: string | null
  leadTimeDays: number
  active: boolean
  /** The project types (ids) this task is ticked for. */
  typeIds: number[]
}

/** Plain-English problems with a master list (empty = fine). Reports at most one per task. */
export function templateTaskProblems(tasks: TemplateTaskInput[]): string[] {
  const problems: string[] = []
  tasks.forEach((t, i) => {
    const title = tidyProjectName(t.title)
    const label = title || `Task ${i + 1}`
    if (!title) problems.push(`${label} needs a title.`)
    else if (title.length > PROJECT_TITLE_MAX) problems.push(`"${label.slice(0, 40)}..." has too long a title (${PROJECT_TITLE_MAX} characters at most).`)
    else {
      const lead = validateTaskLeadTime(t.leadTimeDays)
      if (lead) problems.push(`"${label}": ${lead}`)
    }
  })
  const links = validateDependencies(tasks)
  if (links) problems.push(links)
  return problems
}

/** A task as it will be created in a new project. `key` is the master task's key. */
export interface PlannedProjectTask extends DependencyNode {
  title: string
  description: string | null
  sectionName: string | null
  sectionOrder: number
  assigneeId: string | null
  leadTimeDays: number
  dueDate: string | null
}

/**
 * Works out the tasks a new project starts with: the master tasks that are
 * active and ticked for `typeId` (a blank project, typeId null, gets none),
 * in list order, with links bridged over the left-out tasks and the first due
 * dates worked out from the start date.
 */
export function planProjectTasks(
  master: TemplateTaskInput[],
  typeId: number | null,
  startDate: string,
  holidays: string[] = [],
  sections: { id: number, name: string, sortOrder: number }[] = []
): PlannedProjectTask[] {
  if (typeId === null) return []
  const included = new Set(master.filter(t => t.active && t.typeIds.includes(typeId)).map(t => t.key))
  const kept = bridgeDependencies(master, included)
  const asTasks: ProjectTaskLike[] = kept.map(t => ({
    key: t.key,
    dependsOn: t.dependsOn,
    status: 'todo',
    leadTimeDays: t.leadTimeDays,
    dueDate: null
  }))
  const dates = new Map(initialDueDates(asTasks, startDate, holidays).map(d => [d.key, d.dueDate]))
  return kept.map((t) => {
    const section = sections.find(s => s.id === t.sectionId)
    return {
      key: t.key,
      title: tidyProjectName(t.title),
      description: t.description,
      sectionName: section?.name ?? null,
      sectionOrder: section?.sortOrder ?? NO_SECTION_ORDER,
      assigneeId: t.assigneeId,
      leadTimeDays: t.leadTimeDays,
      dependsOn: t.dependsOn,
      dueDate: dates.get(t.key) ?? null
    }
  })
}

/** Who may change a task's status: its assignee, the project owner, an admin (or the platform owner). */
export function canChangeTaskStatus(args: {
  userId: string
  assigneeId: string | null
  projectOwnerId: string
  isAdmin: boolean
}): boolean {
  return args.isAdmin || args.userId === args.projectOwnerId || args.userId === args.assigneeId
}

/** Why a task can't move to `next`, or null. A blocked task can't be started or finished. */
export function taskStatusProblem(
  current: ProjectTaskStatus,
  next: ProjectTaskStatus,
  blocked: boolean
): string | null {
  if (current === next) return null
  if (blocked && next !== 'todo') {
    return 'This task is waiting for other tasks to be finished, so it can\'t be started yet.'
  }
  return null
}
