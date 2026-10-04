import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  bigint,
  date,
  timestamp,
  primaryKey,
  uniqueIndex,
  index
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { profiles, toolRegistry } from './core'

/**
 * Dashboard (Step 18). Not a tool: no tool_registry row and no roles. Anyone
 * who can sign in can post, comment and react; authors edit their own and the
 * owner deletes anyone's (rules: shared/utils/postRules.ts). Only the owner
 * manages events (rules: shared/utils/eventRules.ts).
 */

/** A post. `pinned_at` set = pinned to the top; the unique index allows only one pinned post. */
export const posts = pgTable(
  'posts',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id),
    body: text('body').notNull(),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    index('posts_created_idx').on(table.createdAt),
    uniqueIndex('posts_one_pinned').on(sql`(true)`).where(sql`${table.pinnedAt} is not null`)
  ]
)

/** Images on a post, stored in R2 under posts/<yyyy>/<mm>/. */
export const postImages = pgTable(
  'post_images',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    fileKey: text('file_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [index('post_images_post_idx').on(table.postId)]
)

/** Comments on a post (one level: no replies to comments). */
export const postComments = pgTable(
  'post_comments',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id),
    body: text('body').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [index('post_comments_post_idx').on(table.postId)]
)

/** One row per person per emoji per post. */
export const postReactions = pgTable(
  'post_reactions',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [primaryKey({ columns: [table.postId, table.userId, table.emoji] })]
)

/** One row per person per emoji per comment. */
export const postCommentReactions = pgTable(
  'post_comment_reactions',
  {
    commentId: integer('comment_id')
      .notNull()
      .references(() => postComments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [primaryKey({ columns: [table.commentId, table.userId, table.emoji] })]
)

/** Company events for the dashboard's Upcoming events. Dates are ISO; time is 'HH:MM' text. */
export const dashboardEvents = pgTable(
  'dashboard_events',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    title: text('title').notNull(),
    date: date('date').notNull(),
    endDate: date('end_date'),
    time: text('time'),
    place: text('place'),
    note: text('note'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [index('dashboard_events_date_idx').on(table.date)]
)

/**
 * Dashboard charts (Step 19). The owner uploads a CSV for Sales overview and
 * another for Goals overview; each upload replaces everything for that chart
 * (rules: shared/utils/dashboardData.ts).
 */

/** One row per uploaded sales line. */
export const dashboardSalesRows = pgTable(
  'dashboard_sales_rows',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    date: date('date').notNull(),
    customer: text('customer'),
    category: text('category'),
    state: text('state'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 2 })
  },
  table => [index('dashboard_sales_rows_date_idx').on(table.date)]
)

/** One row per goal per month. Period is 'YYYY-MM'. */
export const dashboardGoalRows = pgTable(
  'dashboard_goal_rows',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    goal: text('goal').notNull(),
    period: text('period').notNull(),
    target: numeric('target', { precision: 16, scale: 2 }).notNull(),
    actual: numeric('actual', { precision: 16, scale: 2 }).notNull(),
    unit: text('unit')
  },
  table => [uniqueIndex('dashboard_goal_rows_goal_period').on(sql`lower(${table.goal})`, table.period)]
)

/** When each chart's data was last replaced, and by whom. `kind` is 'sales' or 'goals'. */
export const dashboardUploads = pgTable('dashboard_uploads', {
  kind: text('kind').primaryKey(),
  fileName: text('file_name').notNull(),
  rowCount: integer('row_count').notNull(),
  uploadedBy: uuid('uploaded_by').references(() => profiles.id, { onDelete: 'set null' }),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow()
})

/** Tools a person has starred; shown in the dashboard's Favourite tools widget (Step 20.2). */
export const userFavouriteTools = pgTable(
  'user_favourite_tools',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    toolId: text('tool_id')
      .notNull()
      .references(() => toolRegistry.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [primaryKey({ columns: [table.userId, table.toolId] })]
)
