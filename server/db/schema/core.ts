import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  foreignKey,
  unique,
  check
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Mirrors Supabase Auth's `auth.users` table, one row per user, keyed by
 * the same UUID Supabase Auth assigns. We don't manage auth.users directly -
 * a trigger (set up in Step 4) creates a matching profile row whenever a
 * new user signs up.
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // same UUID as auth.users.id
  email: text('email').notNull(),
  fullName: text('full_name'),
  // Global bypass - sees and manages every tool, regardless of tool_roles.
  // This is intentionally separate from the per-tool role system.
  isOwner: boolean('is_owner').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

/**
 * The catalogue of tools available on the platform. The launcher page
 * queries this (filtered by what the current user has access to) to
 * render the tool tiles. Adding a new tool = inserting a row here plus
 * building its own schema/api/pages - no changes needed to this table.
 */
export const toolRegistry = pgTable('tool_registry', {
  id: text('id').primaryKey(), // slug, e.g. 'expense-claims'
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'), // Nuxt UI / Iconify icon name, e.g. 'i-lucide-receipt'
  route: text('route').notNull(), // e.g. '/tools/expense-claims'
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

/**
 * Role definitions, scoped per tool. A tool with simple access needs (cost
 * modelling, charts) can define a single generic 'user' role; a tool with
 * finer-grained access (inspections) can define as many as it needs
 * (inspector, approver, viewer).
 */
export const toolRoles = pgTable(
  'tool_roles',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    toolId: text('tool_id')
      .notNull()
      .references(() => toolRegistry.id, { onDelete: 'cascade' }),
    roleKey: text('role_key').notNull(), // e.g. 'employee', 'manager', 'inspector'
    roleLabel: text('role_label').notNull() // display label, e.g. 'Employee'
  },
  table => [
    unique('tool_roles_tool_id_role_key_unique').on(table.toolId, table.roleKey)
  ]
)

/**
 * Who has which role in which tool. A user can hold several roles in the
 * same tool (e.g. 'employee' + 'manager' in a leave tool), one row per role,
 * and different roles across different tools. Presence of any row for a
 * (user, tool) pair is what makes that tool visible to them on the launcher
 * - independent of `is_owner`, which bypasses this table entirely.
 */
export const userToolRoles = pgTable(
  'user_tool_roles',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    toolId: text('tool_id')
      .notNull()
      .references(() => toolRegistry.id, { onDelete: 'cascade' }),
    roleKey: text('role_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    // A user can hold several roles in a tool, but never the same role twice.
    unique('user_tool_roles_user_id_tool_id_role_key_unique').on(
      table.userId,
      table.toolId,
      table.roleKey
    ),
    // Composite FK: the (toolId, roleKey) pair must exist in tool_roles,
    // so you can't assign someone a role a tool never defined.
    foreignKey({
      columns: [table.toolId, table.roleKey],
      foreignColumns: [toolRoles.toolId, toolRoles.roleKey],
      name: 'user_tool_roles_tool_role_fk'
    })
  ]
)

/**
 * Links an employee to the manager(s) who approve their work, per tool.
 * An employee can be linked to several managers - any ONE of them can
 * approve. A manager only sees work from employees linked to them.
 *
 * Rules the DB enforces: no duplicate links, and nobody manages themselves.
 * Rules enforced at the API layer (not expressible as a simple constraint):
 * the employee must hold the 'employee' role and the manager the 'manager'
 * role in that tool; every employee keeps at least one manager; a manager
 * can't lose the role or link while employees still depend on them.
 */
export const toolManagerLinks = pgTable(
  'tool_manager_links',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    toolId: text('tool_id')
      .notNull()
      .references(() => toolRegistry.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    managerId: uuid('manager_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    unique('tool_manager_links_tool_employee_manager_unique').on(
      table.toolId,
      table.employeeId,
      table.managerId
    ),
    check('tool_manager_links_no_self_manage', sql`${table.employeeId} <> ${table.managerId}`)
  ]
)
