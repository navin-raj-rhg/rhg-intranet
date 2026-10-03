import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  date,
  timestamp,
  check,
  primaryKey,
  uniqueIndex,
  index
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { profiles } from './core'

/**
 * Projects (Step 16). Roles: 'user' (starts projects, works on tasks in
 * projects they belong to) and 'admin' (builds project types and the master
 * task list, sees and manages every project). Owner bypasses both.
 *
 * Projects are private to their members (plus admins and the owner).
 *
 * A project type (Live / Promo / CSO launch, or any an admin adds) is a set of
 * ticks over ONE master task list. Starting a project copies the ticked tasks
 * (links bridged over the left-out ones, see shared/utils/projectRules.ts) into
 * `project_tasks`, so editing the master list later never changes a running
 * project. A project with no type (`type_id` null) is blank: tasks are added by hand.
 *
 * Rules for blocking, unlocking and due dates: shared/utils/projectRules.ts.
 */

export const projectStatus = pgEnum('project_status', ['open', 'closed'])
export const projectTaskStatus = pgEnum('project_task_status', ['todo', 'in_progress', 'done'])

/** Admin-managed project types. Switched off (never deleted) once used. */
export const projectTypes = pgTable(
  'project_types',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [uniqueIndex('project_types_name_ci_unique').on(sql`lower(${table.name})`)]
)

/**
 * Sections group tasks (Marketing, Quality, Purchasing...). One admin-managed,
 * ordered list shared by every project type. Switched off, never deleted.
 */
export const projectSections = pgTable(
  'project_sections',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [uniqueIndex('project_sections_name_ci_unique').on(sql`lower(${table.name})`)]
)

/** The master task list, shared by every project type. */
export const projectTemplateTasks = pgTable(
  'project_template_tasks',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    title: text('title').notNull(),
    description: text('description'),
    sectionId: integer('section_id').references(() => projectSections.id, { onDelete: 'set null' }),
    // A named person; can be changed per project.
    defaultAssigneeId: uuid('default_assignee_id').references(() => profiles.id, { onDelete: 'set null' }),
    // Lead Time: working days allowed once the task unlocks.
    leadTimeDays: integer('lead_time_days').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [check('project_template_tasks_lead_time_range', sql`${table.leadTimeDays} between 0 and 365`)]
)

/** The ticks: which project types a master task applies to. */
export const projectTemplateTaskTypes = pgTable(
  'project_template_task_types',
  {
    taskId: integer('task_id')
      .notNull()
      .references(() => projectTemplateTasks.id, { onDelete: 'cascade' }),
    typeId: integer('type_id')
      .notNull()
      .references(() => projectTypes.id, { onDelete: 'cascade' })
  },
  table => [primaryKey({ columns: [table.taskId, table.typeId] })]
)

/** Master-list links: `task_id` waits for `depends_on_task_id`. */
export const projectTemplateTaskDeps = pgTable(
  'project_template_task_deps',
  {
    taskId: integer('task_id')
      .notNull()
      .references(() => projectTemplateTasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: integer('depends_on_task_id')
      .notNull()
      .references(() => projectTemplateTasks.id, { onDelete: 'cascade' })
  },
  table => [
    primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
    check('project_template_task_deps_not_self', sql`${table.taskId} <> ${table.dependsOnTaskId}`)
  ]
)

export const projects = pgTable(
  'projects',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull(),
    status: projectStatus('status').notNull().default('open'),
    // Null = a blank project. The name is a frozen copy (types can be renamed).
    typeId: integer('type_id').references(() => projectTypes.id, { onDelete: 'set null' }),
    typeName: text('type_name'),
    startDate: date('start_date').notNull(),
    // Optional, for display and the "at risk" flag only; it never moves a due date.
    targetDate: date('target_date'),
    // Optional free-text product list (no link to Cost Modelling or the PIM yet).
    products: text('products'),
    notes: text('notes'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    index('projects_status_idx').on(table.status),
    check('projects_target_after_start', sql`${table.targetDate} is null or ${table.targetDate} >= ${table.startDate}`),
    check('projects_closed_has_time', sql`${table.status} <> 'closed' or ${table.closedAt} is not null`)
  ]
)

/** Who can see and work on a project. The owner is always a member. */
export const projectMembers = pgTable(
  'project_members',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' })
  },
  table => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index('project_members_user_idx').on(table.userId)
  ]
)

/** One task in one project: a frozen copy from the master list, or added by hand. */
export const projectTasks = pgTable(
  'project_tasks',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    templateTaskId: integer('template_task_id').references(() => projectTemplateTasks.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    // Frozen copies of the section's name and position when the task was created.
    sectionName: text('section_name'),
    sectionOrder: integer('section_order').notNull().default(1000000),
    assigneeId: uuid('assignee_id').references(() => profiles.id, { onDelete: 'set null' }),
    status: projectTaskStatus('status').notNull().default('todo'),
    leadTimeDays: integer('lead_time_days').notNull().default(1),
    // Null while the task is blocked (waiting for another task).
    dueDate: date('due_date'),
    // When the task became free to start (project start, or its last predecessor finished).
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by').references(() => profiles.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    index('project_tasks_project_idx').on(table.projectId),
    index('project_tasks_assignee_idx').on(table.assigneeId),
    check('project_tasks_lead_time_range', sql`${table.leadTimeDays} between 0 and 365`),
    check('project_tasks_done_has_time', sql`${table.status} <> 'done' or ${table.completedAt} is not null`)
  ]
)

/** `task_id` waits for `depends_on_task_id` (both in the same project, checked by the API). */
export const projectTaskDeps = pgTable(
  'project_task_deps',
  {
    taskId: integer('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: integer('depends_on_task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' })
  },
  table => [
    primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
    index('project_task_deps_depends_on_idx').on(table.dependsOnTaskId),
    check('project_task_deps_not_self', sql`${table.taskId} <> ${table.dependsOnTaskId}`)
  ]
)

export const projectComments = pgTable(
  'project_comments',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    taskId: integer('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [index('project_comments_task_idx').on(table.taskId)]
)

/** Files attached to a task. Stored in R2 under projects/<yyyy>/<mm>/. */
export const projectFiles = pgTable(
  'project_files',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    taskId: integer('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [index('project_files_task_idx').on(table.taskId)]
)
