import type { H3Event } from 'h3'
import { and, asc, desc, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm'
import type { useDb } from '~~/server/db/client'
import {
  profiles,
  projectComments,
  projectMembers,
  projectTaskDeps,
  projectTasks,
  projectTemplateTaskDeps,
  projectTemplateTaskTypes,
  projectTemplateTasks,
  projectTypes,
  projects,
  userToolRoles,
  leavePublicHolidays
} from '~~/server/db/schema'
import { todayISO } from '~~/server/utils/leaveBalance'
import { isValidISODate } from '~~/shared/utils/leaveRules'
import {
  addWorkingDaysISO,
  bridgeDependencies,
  canChangeTaskStatus,
  isProjectAtRisk,
  isTaskBlocked,
  isTaskOverdue,
  planProjectTasks,
  reopenEffects,
  taskStatusProblem,
  templateTaskProblems,
  tidyProjectName,
  unlockedByCompletion,
  validateDependencies,
  validateTaskLeadTime,
  PROJECT_NAME_MAX,
  PROJECT_TITLE_MAX,
  type ProjectTaskLike,
  type ProjectTaskStatus,
  type TemplateTaskInput
} from '~~/shared/utils/projectRules'
import type {
  ProjectCommentItem,
  ProjectListItem,
  ProjectMyTaskItem,
  ProjectPerson,
  ProjectTaskStatusResponse,
  ProjectTemplateResponse,
  ProjectTypeItem,
  ProjectView
} from '~~/shared/types/projects'

type Db = ReturnType<typeof useDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export const PROJECTS_TOOL_ID = 'projects'
/** Every role on the tool. */
export const PROJECTS_ROLES = ['user', 'admin']

export class ProjectError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Turn a ProjectError into an HTTP error; anything else is rethrown. */
export function projectHttpError(err: unknown): never {
  if (err instanceof ProjectError) throw createError({ statusCode: err.status, statusMessage: err.message })
  throw err
}

export function parseProjectId(event: H3Event, param = 'id', what = 'project'): number {
  const id = Number(getRouterParam(event, param))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: `Invalid ${what}.` })
  return id
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string, cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

export const isProjectsAdmin = (roles: string[]) => roles.includes('admin') || roles.includes('owner')

const personName = (fullName: string | null, email: string | null) => fullName || email || 'Unknown'
const cleanText = (v: string | null | undefined) => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/* ------------------------------------------------------------------ */
/* People and holidays                                                 */
/* ------------------------------------------------------------------ */

/** Active people who can be members or assignees: the owner and anyone holding a Projects role. */
export async function listProjectPeople(db: Db): Promise<ProjectPerson[]> {
  const rows = await db
    .select({ id: profiles.id, fullName: profiles.fullName, email: profiles.email })
    .from(profiles)
    .where(and(
      sql`${profiles.deactivatedAt} is null`,
      or(
        eq(profiles.isOwner, true),
        inArray(
          profiles.id,
          db.select({ id: userToolRoles.userId }).from(userToolRoles).where(eq(userToolRoles.toolId, PROJECTS_TOOL_ID))
        )
      )
    ))
    .orderBy(asc(sql`lower(coalesce(${profiles.fullName}, ${profiles.email}))`))
  return rows.map(r => ({ id: r.id, name: personName(r.fullName, r.email) }))
}

async function failIfNotPeople(db: Db, ids: string[], what: string) {
  if (!ids.length) return
  const people = new Set((await listProjectPeople(db)).map(p => p.id))
  const bad = ids.find(id => !people.has(id))
  if (bad) throw new ProjectError(400, `${what} must be someone with access to Projects.`)
}

async function loadHolidayDates(db: Db | Tx): Promise<string[]> {
  const rows = await db.select({ d: leavePublicHolidays.holidayDate }).from(leavePublicHolidays)
  return rows.map(r => r.d)
}

/* ------------------------------------------------------------------ */
/* Project types and the master task list                              */
/* ------------------------------------------------------------------ */

export async function listProjectTypes(db: Db, includeInactive: boolean): Promise<ProjectTypeItem[]> {
  const rows = await db
    .select({ id: projectTypes.id, name: projectTypes.name, active: projectTypes.active })
    .from(projectTypes)
    .where(includeInactive ? undefined : eq(projectTypes.active, true))
    .orderBy(asc(projectTypes.sortOrder), asc(projectTypes.id))
  return rows
}

export async function createProjectType(db: Db, rawName: string, active: boolean) {
  const name = tidyProjectName(rawName)
  if (!name) throw new ProjectError(400, 'The type needs a name.')
  if (name.length > PROJECT_NAME_MAX) throw new ProjectError(400, `The name is too long (${PROJECT_NAME_MAX} characters at most).`)
  try {
    const [maxRow] = await db.select({ next: sql<number>`coalesce(max(${projectTypes.sortOrder}), 0) + 1` }).from(projectTypes)
    const [row] = await db.insert(projectTypes).values({ name, active, sortOrder: maxRow!.next }).returning({ id: projectTypes.id })
    return row!
  } catch (err) {
    if (isUniqueViolation(err)) throw new ProjectError(409, `There is already a project type called "${name}".`)
    throw err
  }
}

export async function updateProjectType(db: Db, id: number, rawName: string, active: boolean) {
  const name = tidyProjectName(rawName)
  if (!name) throw new ProjectError(400, 'The type needs a name.')
  if (name.length > PROJECT_NAME_MAX) throw new ProjectError(400, `The name is too long (${PROJECT_NAME_MAX} characters at most).`)
  try {
    const [row] = await db.update(projectTypes).set({ name, active }).where(eq(projectTypes.id, id)).returning({ id: projectTypes.id })
    if (!row) throw new ProjectError(404, 'That project type no longer exists.')
    return row
  } catch (err) {
    if (isUniqueViolation(err)) throw new ProjectError(409, `There is already a project type called "${name}".`)
    throw err
  }
}

async function loadTemplateInputs(db: Db | Tx): Promise<TemplateTaskInput[]> {
  const [tasks, types, deps] = await Promise.all([
    db.select().from(projectTemplateTasks).orderBy(asc(projectTemplateTasks.sortOrder), asc(projectTemplateTasks.id)),
    db.select().from(projectTemplateTaskTypes),
    db.select().from(projectTemplateTaskDeps)
  ])
  return tasks.map(t => ({
    key: String(t.id),
    title: t.title,
    description: t.description,
    assigneeId: t.defaultAssigneeId,
    leadTimeDays: t.leadTimeDays,
    active: t.active,
    typeIds: types.filter(x => x.taskId === t.id).map(x => x.typeId),
    dependsOn: deps.filter(x => x.taskId === t.id).map(x => String(x.dependsOnTaskId))
  }))
}

export async function loadProjectTemplate(db: Db): Promise<ProjectTemplateResponse> {
  return {
    types: await listProjectTypes(db, true),
    tasks: (await loadTemplateInputs(db)).map(t => ({ ...t }))
  }
}

export interface TemplateSaveTask extends TemplateTaskInput {
  id?: number
}

/**
 * Replaces the whole master list in one go (the admin screen saves everything
 * together). Existing tasks are matched by id; tasks left out of the list are
 * deleted - running projects keep their own copies. Projects already started
 * are never touched.
 */
export async function saveProjectTemplate(db: Db, incoming: TemplateSaveTask[]) {
  const cleaned = incoming.map(t => ({ ...t, title: tidyProjectName(t.title), description: cleanText(t.description) }))
  const problem = templateTaskProblems(cleaned)[0]
  if (problem) throw new ProjectError(400, problem)

  const typeRows = await db.select({ id: projectTypes.id }).from(projectTypes)
  const typeIds = new Set(typeRows.map(t => t.id))
  if (cleaned.some(t => t.typeIds.some(id => !typeIds.has(id)))) {
    throw new ProjectError(400, 'A project type in that list no longer exists. Reload the page and try again.')
  }
  await failIfNotPeople(db, [...new Set(cleaned.map(t => t.assigneeId).filter((x): x is string => !!x))], 'A default assignee')

  await db.transaction(async (tx) => {
    const existing = new Set((await tx.select({ id: projectTemplateTasks.id }).from(projectTemplateTasks)).map(r => r.id))
    const keep = new Set<number>()
    for (const t of cleaned) {
      if (t.id !== undefined) {
        if (!existing.has(t.id)) throw new ProjectError(409, 'The task list changed while you were editing. Reload the page and try again.')
        if (keep.has(t.id)) throw new ProjectError(400, 'A task appears twice in the list.')
        keep.add(t.id)
      }
    }
    const gone = [...existing].filter(id => !keep.has(id))
    if (gone.length) await tx.delete(projectTemplateTasks).where(inArray(projectTemplateTasks.id, gone))

    const idByKey = new Map<string, number>()
    for (const [index, t] of cleaned.entries()) {
      const values = {
        title: t.title,
        description: t.description,
        defaultAssigneeId: t.assigneeId ?? null,
        leadTimeDays: t.leadTimeDays,
        sortOrder: index,
        active: t.active
      }
      if (t.id !== undefined) {
        await tx.update(projectTemplateTasks).set({ ...values, updatedAt: new Date() }).where(eq(projectTemplateTasks.id, t.id))
        idByKey.set(t.key, t.id)
      } else {
        const [row] = await tx.insert(projectTemplateTasks).values(values).returning({ id: projectTemplateTasks.id })
        idByKey.set(t.key, row!.id)
      }
    }

    const ids = [...idByKey.values()]
    if (ids.length) {
      await tx.delete(projectTemplateTaskTypes).where(inArray(projectTemplateTaskTypes.taskId, ids))
      await tx.delete(projectTemplateTaskDeps).where(inArray(projectTemplateTaskDeps.taskId, ids))
    }
    const typeLinks = cleaned.flatMap(t => [...new Set(t.typeIds)].map(typeId => ({ taskId: idByKey.get(t.key)!, typeId })))
    if (typeLinks.length) await tx.insert(projectTemplateTaskTypes).values(typeLinks)
    const depLinks = cleaned.flatMap(t => [...new Set(t.dependsOn)].map(d => ({ taskId: idByKey.get(t.key)!, dependsOnTaskId: idByKey.get(d)! })))
    if (depLinks.length) await tx.insert(projectTemplateTaskDeps).values(depLinks)
  })
}

/* ------------------------------------------------------------------ */
/* Access                                                              */
/* ------------------------------------------------------------------ */

export interface ProjectAccess {
  project: typeof projects.$inferSelect
  isAdmin: boolean
  /** Owner of the project, an admin or the platform owner. */
  canManage: boolean
}

/** Loads a project the caller may see: admins and the owner see all, everyone else only their own. */
export async function loadProjectAccess(db: Db | Tx, projectId: number, userId: string, roles: string[]): Promise<ProjectAccess> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
  const isAdmin = isProjectsAdmin(roles)
  if (project && !isAdmin) {
    const [member] = await db
      .select({ u: projectMembers.userId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    if (!member) throw new ProjectError(404, 'That project does not exist, or you are not a member of it.')
  }
  if (!project) throw new ProjectError(404, 'That project does not exist, or you are not a member of it.')
  return { project, isAdmin, canManage: isAdmin || project.ownerId === userId }
}

/* ------------------------------------------------------------------ */
/* Listing and viewing                                                 */
/* ------------------------------------------------------------------ */

export async function listProjects(
  db: Db,
  userId: string,
  roles: string[],
  opts: { all: boolean, status?: 'open' | 'closed' }
): Promise<ProjectListItem[]> {
  const showAll = opts.all && isProjectsAdmin(roles)
  const conditions = []
  if (opts.status) conditions.push(eq(projects.status, opts.status))
  if (!showAll) {
    conditions.push(inArray(
      projects.id,
      db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, userId))
    ))
  }
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      typeName: projects.typeName,
      startDate: projects.startDate,
      targetDate: projects.targetDate,
      ownerName: profiles.fullName,
      ownerEmail: profiles.email
    })
    .from(projects)
    .innerJoin(profiles, eq(profiles.id, projects.ownerId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(projects.createdAt))
  if (!rows.length) return []

  const tasks = await db
    .select({ projectId: projectTasks.projectId, status: projectTasks.status, dueDate: projectTasks.dueDate })
    .from(projectTasks)
    .where(inArray(projectTasks.projectId, rows.map(r => r.id)))
  const today = todayISO()
  return rows.map((r) => {
    const mine = tasks.filter(t => t.projectId === r.id)
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      typeName: r.typeName,
      startDate: r.startDate,
      targetDate: r.targetDate,
      ownerName: personName(r.ownerName, r.ownerEmail),
      openTasks: mine.filter(t => t.status !== 'done').length,
      doneTasks: mine.filter(t => t.status === 'done').length,
      overdueTasks: mine.filter(t => isTaskOverdue(t, today)).length,
      atRisk: r.status === 'open' && isProjectAtRisk(mine, r.targetDate, today)
    }
  })
}

export async function loadProjectView(db: Db | Tx, access: ProjectAccess): Promise<ProjectView> {
  const { project } = access
  const [owner] = await db.select({ fullName: profiles.fullName, email: profiles.email }).from(profiles).where(eq(profiles.id, project.ownerId))
  const members = await db
    .select({ id: profiles.id, fullName: profiles.fullName, email: profiles.email })
    .from(projectMembers)
    .innerJoin(profiles, eq(profiles.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, project.id))
    .orderBy(asc(sql`lower(coalesce(${profiles.fullName}, ${profiles.email}))`))
  const tasks = await db
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      description: projectTasks.description,
      assigneeId: projectTasks.assigneeId,
      assigneeName: profiles.fullName,
      assigneeEmail: profiles.email,
      status: projectTasks.status,
      leadTimeDays: projectTasks.leadTimeDays,
      dueDate: projectTasks.dueDate,
      completedAt: projectTasks.completedAt
    })
    .from(projectTasks)
    .leftJoin(profiles, eq(profiles.id, projectTasks.assigneeId))
    .where(eq(projectTasks.projectId, project.id))
    .orderBy(asc(projectTasks.sortOrder), asc(projectTasks.id))
  const taskIds = tasks.map(t => t.id)
  const deps = taskIds.length ? await db.select().from(projectTaskDeps).where(inArray(projectTaskDeps.taskId, taskIds)) : []
  const comments = taskIds.length
    ? await db
        .select({ taskId: projectComments.taskId, n: sql<number>`count(*)::int` })
        .from(projectComments)
        .where(inArray(projectComments.taskId, taskIds))
        .groupBy(projectComments.taskId)
    : []

  const today = todayISO()
  const statuses = tasks.map(t => ({ key: String(t.id), status: t.status }))
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    typeName: project.typeName,
    startDate: project.startDate,
    targetDate: project.targetDate,
    products: project.products,
    notes: project.notes,
    ownerId: project.ownerId,
    ownerName: personName(owner?.fullName ?? null, owner?.email ?? null),
    atRisk: project.status === 'open' && isProjectAtRisk(tasks, project.targetDate, today),
    members: members.map(m => ({ id: m.id, name: personName(m.fullName, m.email) })),
    canManage: access.canManage,
    tasks: tasks.map((t) => {
      const dependsOn = deps.filter(d => d.taskId === t.id).map(d => d.dependsOnTaskId)
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        assigneeId: t.assigneeId,
        assigneeName: t.assigneeId ? personName(t.assigneeName, t.assigneeEmail) : null,
        status: t.status,
        blocked: t.status !== 'done' && isTaskBlocked({ key: String(t.id), dependsOn: dependsOn.map(String) }, statuses),
        leadTimeDays: t.leadTimeDays,
        dueDate: t.dueDate,
        overdue: isTaskOverdue(t, today),
        dependsOn,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
        commentCount: comments.find(c => c.taskId === t.id)?.n ?? 0
      }
    })
  }
}

/** Tasks assigned to the person that are ready to work on (for the dashboard banner). */
export async function listMyProjectTasks(db: Db, userId: string): Promise<ProjectMyTaskItem[]> {
  const rows = await db
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      projectId: projects.id,
      projectName: projects.name,
      dueDate: projectTasks.dueDate,
      status: projectTasks.status
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(and(
      eq(projectTasks.assigneeId, userId),
      ne(projectTasks.status, 'done'),
      isNotNull(projectTasks.dueDate),
      eq(projects.status, 'open')
    ))
    .orderBy(asc(projectTasks.dueDate), asc(projectTasks.id))
  const today = todayISO()
  return rows.map(r => ({ ...r, overdue: isTaskOverdue(r, today) }))
}

/* ------------------------------------------------------------------ */
/* Creating and editing projects                                       */
/* ------------------------------------------------------------------ */

export interface NewProjectInput {
  name: string
  typeId: number | null
  startDate: string
  targetDate: string | null
  products: string | null
  notes: string | null
  memberIds: string[]
}

function checkProjectDates(startDate: string, targetDate: string | null) {
  if (!isValidISODate(startDate)) throw new ProjectError(400, 'The start date is not a real date.')
  if (targetDate !== null) {
    if (!isValidISODate(targetDate)) throw new ProjectError(400, 'The target date is not a real date.')
    if (targetDate < startDate) throw new ProjectError(400, 'The target date can\'t be before the start date.')
  }
}

function checkProjectName(raw: string): string {
  const name = tidyProjectName(raw)
  if (!name) throw new ProjectError(400, 'The project needs a name.')
  if (name.length > PROJECT_NAME_MAX) throw new ProjectError(400, `The name is too long (${PROJECT_NAME_MAX} characters at most).`)
  return name
}

/**
 * Starts a project. Copies the master tasks ticked for its type (links bridged
 * over the left-out ones) with their first due dates. Everyone named as a
 * default assignee is added as a member so they can see their tasks.
 */
export async function createProject(db: Db, ownerId: string, input: NewProjectInput): Promise<{ id: number }> {
  const name = checkProjectName(input.name)
  checkProjectDates(input.startDate, input.targetDate)
  await failIfNotPeople(db, input.memberIds, 'A member')

  let typeName: string | null = null
  if (input.typeId !== null) {
    const [type] = await db.select().from(projectTypes).where(eq(projectTypes.id, input.typeId))
    if (!type || !type.active) throw new ProjectError(400, 'That project type is not available.')
    typeName = type.name
  }

  const people = new Set((await listProjectPeople(db)).map(p => p.id))
  const master = (await loadTemplateInputs(db)).map(t => ({
    ...t,
    assigneeId: t.assigneeId && people.has(t.assigneeId) ? t.assigneeId : null
  }))
  const planned = planProjectTasks(master, input.typeId, input.startDate, await loadHolidayDates(db))
  const memberIds = new Set([ownerId, ...input.memberIds, ...planned.map(t => t.assigneeId).filter((x): x is string => !!x)])

  return await db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values({
      name,
      typeId: input.typeId,
      typeName,
      startDate: input.startDate,
      targetDate: input.targetDate,
      products: cleanText(input.products),
      notes: cleanText(input.notes),
      ownerId
    }).returning({ id: projects.id })
    const projectId = project!.id

    await tx.insert(projectMembers).values([...memberIds].map(userId => ({ projectId, userId })))

    if (planned.length) {
      const now = new Date()
      const inserted = await tx.insert(projectTasks).values(planned.map((t, index) => ({
        projectId,
        templateTaskId: Number(t.key),
        title: t.title,
        description: t.description,
        assigneeId: t.assigneeId,
        leadTimeDays: t.leadTimeDays,
        dueDate: t.dueDate,
        unlockedAt: t.dueDate ? now : null,
        sortOrder: index
      }))).returning({ id: projectTasks.id })
      const idByKey = new Map(planned.map((t, i) => [t.key, inserted[i]!.id]))
      const links = planned.flatMap(t => t.dependsOn.map(d => ({ taskId: idByKey.get(t.key)!, dependsOnTaskId: idByKey.get(d)! })))
      if (links.length) await tx.insert(projectTaskDeps).values(links)
    }
    return { id: projectId }
  })
}

export async function updateProject(
  db: Db,
  access: ProjectAccess,
  input: { name: string, targetDate: string | null, products: string | null, notes: string | null, ownerId: string }
) {
  if (!access.canManage) throw new ProjectError(403, 'Only the project owner or an admin can change the project details.')
  const name = checkProjectName(input.name)
  checkProjectDates(access.project.startDate, input.targetDate)
  if (input.ownerId !== access.project.ownerId) await failIfNotPeople(db, [input.ownerId], 'The new owner')
  await db.transaction(async (tx) => {
    await tx.update(projects).set({
      name,
      targetDate: input.targetDate,
      products: cleanText(input.products),
      notes: cleanText(input.notes),
      ownerId: input.ownerId,
      updatedAt: new Date()
    }).where(eq(projects.id, access.project.id))
    await tx.insert(projectMembers).values({ projectId: access.project.id, userId: input.ownerId }).onConflictDoNothing()
  })
}

export async function setProjectStatus(db: Db, access: ProjectAccess, status: 'open' | 'closed') {
  if (!access.canManage) throw new ProjectError(403, 'Only the project owner or an admin can close or reopen a project.')
  await db.update(projects)
    .set({ status, closedAt: status === 'closed' ? new Date() : null, updatedAt: new Date() })
    .where(eq(projects.id, access.project.id))
}

export async function setProjectMembers(db: Db, access: ProjectAccess, memberIds: string[]) {
  if (!access.canManage) throw new ProjectError(403, 'Only the project owner or an admin can change who is in the project.')
  const wanted = new Set([access.project.ownerId, ...memberIds])
  await failIfNotPeople(db, [...wanted], 'A member')

  const current = await db.select({ id: projectMembers.userId }).from(projectMembers).where(eq(projectMembers.projectId, access.project.id))
  const removed = current.map(c => c.id).filter(id => !wanted.has(id))
  if (removed.length) {
    const stuck = await db
      .select({ name: profiles.fullName, email: profiles.email })
      .from(projectTasks)
      .innerJoin(profiles, eq(profiles.id, projectTasks.assigneeId))
      .where(and(eq(projectTasks.projectId, access.project.id), ne(projectTasks.status, 'done'), inArray(projectTasks.assigneeId, removed)))
    if (stuck.length) {
      const names = [...new Set(stuck.map(s => personName(s.name, s.email)))]
      throw new ProjectError(409, `${names.join(', ')} still ${names.length === 1 ? 'has' : 'have'} unfinished tasks in this project. Give those tasks to someone else first.`)
    }
  }
  await db.transaction(async (tx) => {
    if (removed.length) {
      await tx.delete(projectMembers).where(and(eq(projectMembers.projectId, access.project.id), inArray(projectMembers.userId, removed)))
    }
    await tx.insert(projectMembers).values([...wanted].map(userId => ({ projectId: access.project.id, userId }))).onConflictDoNothing()
  })
}

export async function deleteProject(db: Db, access: ProjectAccess) {
  if (!access.isAdmin) throw new ProjectError(403, 'Only an admin can delete a project.')
  await db.delete(projects).where(eq(projects.id, access.project.id))
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

function failIfClosed(access: ProjectAccess) {
  if (access.project.status === 'closed') throw new ProjectError(409, 'This project is closed. Reopen it to change its tasks.')
}

function checkTaskFields(title: string, leadTimeDays: number): string {
  const t = tidyProjectName(title)
  if (!t) throw new ProjectError(400, 'The task needs a title.')
  if (t.length > PROJECT_TITLE_MAX) throw new ProjectError(400, `The title is too long (${PROJECT_TITLE_MAX} characters at most).`)
  const lead = validateTaskLeadTime(leadTimeDays)
  if (lead) throw new ProjectError(400, lead)
  return t
}

async function failIfAssigneeNotMember(tx: Db | Tx, projectId: number, assigneeId: string | null | undefined) {
  if (!assigneeId) return
  const [m] = await tx
    .select({ u: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, assigneeId)))
  if (!m) throw new ProjectError(400, 'A task can only be given to someone who is a member of the project. Add them to the project first.')
}

async function loadTaskGraph(tx: Db | Tx, projectId: number) {
  const tasks = await tx.select().from(projectTasks).where(eq(projectTasks.projectId, projectId))
  const ids = tasks.map(t => t.id)
  const deps = ids.length ? await tx.select().from(projectTaskDeps).where(inArray(projectTaskDeps.taskId, ids)) : []
  const likes: ProjectTaskLike[] = tasks.map(t => ({
    key: String(t.id),
    status: t.status,
    leadTimeDays: t.leadTimeDays,
    dueDate: t.dueDate,
    dependsOn: deps.filter(d => d.taskId === t.id).map(d => String(d.dependsOnTaskId))
  }))
  return { tasks, likes }
}

/** Gives a due date (today + lead time) to tasks that just became free and have none. */
async function dateNewlyFreeTasks(tx: Tx, likes: ProjectTaskLike[], holidays: string[], today: string) {
  const dated: number[] = []
  for (const t of likes) {
    if (t.status === 'todo' && t.dueDate === null && !isTaskBlocked(t, likes)) {
      await tx.update(projectTasks)
        .set({ dueDate: addWorkingDaysISO(today, t.leadTimeDays, holidays), unlockedAt: new Date(), updatedAt: new Date() })
        .where(eq(projectTasks.id, Number(t.key)))
      dated.push(Number(t.key))
    }
  }
  return dated
}

export interface NewTaskInput {
  title: string
  description: string | null
  assigneeId: string | null
  leadTimeDays: number
  dependsOn: number[]
}

/** A one-off task added by hand. It can wait for other tasks in the same project. */
export async function addProjectTask(db: Db, access: ProjectAccess, input: NewTaskInput): Promise<{ id: number }> {
  failIfClosed(access)
  const title = checkTaskFields(input.title, input.leadTimeDays)
  const holidays = await loadHolidayDates(db)
  return await db.transaction(async (tx) => {
    await failIfAssigneeNotMember(tx, access.project.id, input.assigneeId)
    const { tasks, likes } = await loadTaskGraph(tx, access.project.id)
    const known = new Set(tasks.map(t => t.id))
    const dependsOn = [...new Set(input.dependsOn)]
    if (dependsOn.some(d => !known.has(d))) throw new ProjectError(400, 'A task it waits for is not in this project.')

    const today = todayISO()
    const probe: ProjectTaskLike = { key: 'new', status: 'todo', leadTimeDays: input.leadTimeDays, dueDate: null, dependsOn: dependsOn.map(String) }
    const blocked = isTaskBlocked(probe, likes)
    const now = new Date()
    const [row] = await tx.insert(projectTasks).values({
      projectId: access.project.id,
      title,
      description: cleanText(input.description),
      assigneeId: input.assigneeId,
      leadTimeDays: input.leadTimeDays,
      dueDate: blocked ? null : addWorkingDaysISO(today, input.leadTimeDays, holidays),
      unlockedAt: blocked ? null : now,
      sortOrder: tasks.length ? Math.max(...tasks.map(t => t.sortOrder)) + 1 : 0
    }).returning({ id: projectTasks.id })
    if (dependsOn.length) await tx.insert(projectTaskDeps).values(dependsOn.map(d => ({ taskId: row!.id, dependsOnTaskId: d })))
    return row!
  })
}

/** Edits a task's details, assignee, lead time or the tasks it waits for. Dates follow the new links. */
export async function updateProjectTask(
  db: Db,
  access: ProjectAccess,
  taskId: number,
  input: NewTaskInput
) {
  failIfClosed(access)
  const title = checkTaskFields(input.title, input.leadTimeDays)
  const holidays = await loadHolidayDates(db)
  await db.transaction(async (tx) => {
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, access.project.id)).for('update')
    await failIfAssigneeNotMember(tx, access.project.id, input.assigneeId)
    const { tasks, likes } = await loadTaskGraph(tx, access.project.id)
    const task = tasks.find(t => t.id === taskId)
    if (!task) throw new ProjectError(404, 'That task no longer exists.')
    const known = new Set(tasks.map(t => t.id))
    const dependsOn = [...new Set(input.dependsOn)]
    if (dependsOn.some(d => !known.has(d))) throw new ProjectError(400, 'A task it waits for is not in this project.')

    const next = likes.map(t => t.key === String(taskId) ? { ...t, dependsOn: dependsOn.map(String), leadTimeDays: input.leadTimeDays } : t)
    const problem = validateDependencies(next)
    if (problem) throw new ProjectError(400, problem)

    const nowBlocked = task.status !== 'done' && isTaskBlocked(next.find(t => t.key === String(taskId))!, next)
    await tx.update(projectTasks).set({
      title,
      description: cleanText(input.description),
      assigneeId: input.assigneeId,
      leadTimeDays: input.leadTimeDays,
      // A task that is waiting again loses its date (unless already started).
      ...(nowBlocked && task.status === 'todo' ? { dueDate: null, unlockedAt: null } : {}),
      updatedAt: new Date()
    }).where(eq(projectTasks.id, taskId))
    await tx.delete(projectTaskDeps).where(eq(projectTaskDeps.taskId, taskId))
    if (dependsOn.length) await tx.insert(projectTaskDeps).values(dependsOn.map(d => ({ taskId: taskId, dependsOnTaskId: d })))

    const refreshed = next.map(t => t.key === String(taskId) && nowBlocked && task.status === 'todo' ? { ...t, dueDate: null } : t)
    await dateNewlyFreeTasks(tx, refreshed, holidays, todayISO())
  })
}

/**
 * Deletes a task. Tasks that waited for it inherit what it waited for, and any
 * that become free get a due date (today + their lead time).
 */
export async function deleteProjectTask(db: Db, access: ProjectAccess, taskId: number) {
  if (!access.canManage) throw new ProjectError(403, 'Only the project owner or an admin can delete a task.')
  failIfClosed(access)
  const holidays = await loadHolidayDates(db)
  await db.transaction(async (tx) => {
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, access.project.id)).for('update')
    const { tasks, likes } = await loadTaskGraph(tx, access.project.id)
    if (!tasks.some(t => t.id === taskId)) throw new ProjectError(404, 'That task no longer exists.')
    const key = String(taskId)
    const bridged = bridgeDependencies(likes, new Set(likes.map(t => t.key).filter(k => k !== key)))
    for (const t of bridged) {
      const before = likes.find(l => l.key === t.key)!
      if (before.dependsOn.includes(key)) {
        await tx.delete(projectTaskDeps).where(eq(projectTaskDeps.taskId, Number(t.key)))
        if (t.dependsOn.length) await tx.insert(projectTaskDeps).values(t.dependsOn.map(d => ({ taskId: Number(t.key), dependsOnTaskId: Number(d) })))
      }
    }
    await tx.delete(projectTasks).where(eq(projectTasks.id, taskId))
    await dateNewlyFreeTasks(tx, bridged, holidays, todayISO())
  })
}

/**
 * Moves a task between To do / In progress / Done. Finishing a task unlocks the
 * tasks that were waiting only for it (due date = today + their lead time);
 * reopening one puts unstarted dependents back to Blocked.
 */
export async function changeTaskStatus(
  db: Db,
  access: ProjectAccess,
  userId: string,
  taskId: number,
  next: ProjectTaskStatus
): Promise<ProjectTaskStatusResponse> {
  failIfClosed(access)
  const holidays = await loadHolidayDates(db)
  return await db.transaction(async (tx) => {
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, access.project.id)).for('update')
    const { tasks, likes } = await loadTaskGraph(tx, access.project.id)
    const task = tasks.find(t => t.id === taskId)
    if (!task) throw new ProjectError(404, 'That task no longer exists.')
    if (!canChangeTaskStatus({ userId, assigneeId: task.assigneeId, projectOwnerId: access.project.ownerId, isAdmin: access.isAdmin })) {
      throw new ProjectError(403, 'Only the person the task is assigned to, the project owner or an admin can change this task.')
    }
    const key = String(taskId)
    const me = likes.find(t => t.key === key)!
    const problem = taskStatusProblem(task.status, next, task.status !== 'done' && isTaskBlocked(me, likes))
    if (problem) throw new ProjectError(409, problem)

    const titleOf = (k: string) => tasks.find(t => String(t.id) === k)?.title ?? k
    const result: ProjectTaskStatusResponse = { unlocked: [], reblocked: [], warn: [] }
    if (task.status === next) return result

    const now = new Date()
    await tx.update(projectTasks).set({
      status: next,
      completedAt: next === 'done' ? now : null,
      completedBy: next === 'done' ? userId : null,
      updatedAt: now
    }).where(eq(projectTasks.id, taskId))
    const after = likes.map(t => t.key === key ? { ...t, status: next } : t)

    if (next === 'done') {
      const free = unlockedByCompletion(after, key, todayISO(), holidays).filter(u => after.find(t => t.key === u.key)!.dueDate === null)
      for (const u of free) {
        await tx.update(projectTasks).set({ dueDate: u.dueDate, unlockedAt: now, updatedAt: now }).where(eq(projectTasks.id, Number(u.key)))
        result.unlocked.push(titleOf(u.key))
      }
    } else if (task.status === 'done') {
      const effects = reopenEffects(after, key)
      if (effects.reblocked.length) {
        await tx.update(projectTasks)
          .set({ dueDate: null, unlockedAt: null, updatedAt: now })
          .where(inArray(projectTasks.id, effects.reblocked.map(Number)))
      }
      result.reblocked = effects.reblocked.map(titleOf)
      result.warn = effects.warn.map(titleOf)
    }
    return result
  })
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

async function failIfTaskNotInProject(db: Db, projectId: number, taskId: number) {
  const [t] = await db.select({ id: projectTasks.id }).from(projectTasks).where(and(eq(projectTasks.id, taskId), eq(projectTasks.projectId, projectId)))
  if (!t) throw new ProjectError(404, 'That task no longer exists.')
}

export async function listTaskComments(db: Db, projectId: number, taskId: number): Promise<ProjectCommentItem[]> {
  await failIfTaskNotInProject(db, projectId, taskId)
  const rows = await db
    .select({ id: projectComments.id, body: projectComments.body, createdAt: projectComments.createdAt, name: profiles.fullName, email: profiles.email })
    .from(projectComments)
    .innerJoin(profiles, eq(profiles.id, projectComments.authorId))
    .where(eq(projectComments.taskId, taskId))
    .orderBy(asc(projectComments.createdAt), asc(projectComments.id))
  return rows.map(r => ({ id: r.id, body: r.body, createdAt: r.createdAt.toISOString(), authorName: personName(r.name, r.email) }))
}

export async function addTaskComment(db: Db, projectId: number, taskId: number, authorId: string, rawBody: string) {
  await failIfTaskNotInProject(db, projectId, taskId)
  const body = rawBody.trim()
  if (!body) throw new ProjectError(400, 'Write a comment first.')
  const [row] = await db.insert(projectComments).values({ taskId, authorId, body }).returning({ id: projectComments.id })
  return row!
}
