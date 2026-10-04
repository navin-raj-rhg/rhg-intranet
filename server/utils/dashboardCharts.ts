import { eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { useDb } from '~~/server/db/client'
import { dashboardGoalRows, dashboardSalesRows, dashboardUploads, profiles, projectTasks } from '~~/server/db/schema'
import { todayISO } from '~~/server/utils/leaveBalance'
import { isProjectsAdmin, listProjects } from '~~/server/utils/projects'
import {
  goalsSummary, parseGoalsCsv, parseSalesCsv, projectOverviewSummary, salesSummary,
  type GoalRow, type SalesRow
} from '~~/shared/utils/dashboardData'

type Db = ReturnType<typeof useDb>

export const CHART_KINDS = ['sales', 'goals'] as const
export type ChartKind = (typeof CHART_KINDS)[number]

export const chartUploadSchema = z.object({
  csv: z.string({ message: 'Choose a CSV file' }).max(15_000_000, 'That file is too big.'),
  fileName: z.string().max(255).default('upload.csv'),
  apply: z.boolean().default(false)
})

export interface ChartUploadInfo {
  fileName: string
  rowCount: number
  uploadedAt: string
  uploadedBy: string | null
}

export async function loadChartUploads(db: Db): Promise<Record<ChartKind, ChartUploadInfo | null>> {
  const rows = await db
    .select({
      kind: dashboardUploads.kind,
      fileName: dashboardUploads.fileName,
      rowCount: dashboardUploads.rowCount,
      uploadedAt: dashboardUploads.uploadedAt,
      name: profiles.fullName,
      email: profiles.email
    })
    .from(dashboardUploads)
    .leftJoin(profiles, eq(profiles.id, dashboardUploads.uploadedBy))
  const out: Record<ChartKind, ChartUploadInfo | null> = { sales: null, goals: null }
  for (const r of rows) {
    if (r.kind !== 'sales' && r.kind !== 'goals') continue
    out[r.kind] = {
      fileName: r.fileName,
      rowCount: r.rowCount,
      uploadedAt: r.uploadedAt.toISOString(),
      uploadedBy: r.name?.trim() || r.email || null
    }
  }
  return out
}

const CHUNK = 2000

/**
 * Checks an uploaded file and, with `apply`, replaces ALL existing rows for that chart
 * (in one transaction, so a failure leaves the old data in place).
 */
export async function uploadChartData(
  db: Db,
  userId: string,
  kind: ChartKind,
  body: { csv: string, fileName: string, apply: boolean }
): Promise<{ rowCount: number, problems: string[], applied: boolean }> {
  const read = kind === 'sales' ? parseSalesCsv(body.csv) : parseGoalsCsv(body.csv)
  if (read.problems.length) return { rowCount: 0, problems: read.problems, applied: false }
  if (!body.apply) return { rowCount: read.rows.length, problems: [], applied: false }
  await db.transaction(async (tx) => {
    if (kind === 'sales') {
      await tx.delete(dashboardSalesRows)
      const rows = read.rows as SalesRow[]
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.insert(dashboardSalesRows).values(rows.slice(i, i + CHUNK).map(r => ({
          date: r.date,
          customer: r.customer,
          category: r.category,
          state: r.state,
          amount: String(r.amount),
          quantity: r.quantity === null ? null : String(r.quantity)
        })))
      }
    } else {
      await tx.delete(dashboardGoalRows)
      const rows = read.rows as GoalRow[]
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.insert(dashboardGoalRows).values(rows.slice(i, i + CHUNK).map(r => ({
          goal: r.goal,
          period: r.period,
          target: String(r.target),
          actual: String(r.actual),
          unit: r.unit
        })))
      }
    }
    const values = { kind, fileName: body.fileName, rowCount: read.rows.length, uploadedBy: userId, uploadedAt: new Date() }
    await tx.insert(dashboardUploads).values(values).onConflictDoUpdate({ target: dashboardUploads.kind, set: values })
  })
  return { rowCount: read.rows.length, problems: [], applied: true }
}

export async function loadSalesChart(db: Db) {
  const rows = await db.select().from(dashboardSalesRows)
  const sales: SalesRow[] = rows.map(r => ({
    date: r.date,
    customer: r.customer,
    category: r.category,
    state: r.state,
    amount: Number(r.amount),
    quantity: r.quantity === null ? null : Number(r.quantity)
  }))
  const uploads = await loadChartUploads(db)
  return { upload: uploads.sales, summary: uploads.sales ? salesSummary(sales, todayISO()) : null }
}

export async function loadGoalsChart(db: Db) {
  const rows = await db.select().from(dashboardGoalRows)
  const goals: GoalRow[] = rows.map(r => ({
    goal: r.goal,
    period: r.period,
    target: Number(r.target),
    actual: Number(r.actual),
    unit: r.unit
  }))
  const uploads = await loadChartUploads(db)
  return { upload: uploads.goals, goals: uploads.goals ? goalsSummary(goals, todayISO()) : [] }
}

/** Project overview for the caller: admins and the owner see every open project, others their own. */
export async function loadProjectOverview(db: Db, userId: string, roles: string[]) {
  const all = isProjectsAdmin(roles)
  const open = await listProjects(db, userId, roles, { all, status: 'open' })
  const counts = { todo: 0, in_progress: 0, done: 0 }
  if (open.length) {
    const rows = await db
      .select({ status: projectTasks.status, n: sql<number>`count(*)::int` })
      .from(projectTasks)
      .where(inArray(projectTasks.projectId, open.map(p => p.id)))
      .groupBy(projectTasks.status)
    for (const r of rows) counts[r.status] = r.n
  }
  return projectOverviewSummary(all ? 'all' : 'mine', open, counts)
}
