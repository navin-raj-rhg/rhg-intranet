import { and, asc, eq, inArray } from 'drizzle-orm'
import { useDb } from '~~/server/db/client'
import { expenseClaims, expensePayoutBatches, profiles } from '~~/server/db/schema'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { getManagedEmployeeIds } from '~~/server/utils/toolTeams'
import { buildObjectKey, putObject, getDownloadUrl } from '~~/server/utils/r2'
import { generateExpenseReportPdf } from '~~/server/utils/generateExpenseReportPdf'

export default defineEventHandler(async (event) => {
  const { profile, role } = await requireToolRole(event, 'expense-claims', ['manager'])
  const db = useDb()

  // A manager's report covers approved claims from their own team only,
  // whichever linked manager approved them. The owner's covers everyone.
  const conditions = [eq(expenseClaims.status, 'approved')]
  if (role !== 'owner') {
    const employeeIds = await getManagedEmployeeIds('expense-claims', profile.id)
    if (employeeIds.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No approved claims are waiting to be paid.' })
    }
    conditions.push(inArray(expenseClaims.employeeId, employeeIds))
  }

  const rows = await db
    .select({
      id: expenseClaims.id,
      employeeName: profiles.fullName,
      employeeEmail: profiles.email,
      expenseDate: expenseClaims.expenseDate,
      category: expenseClaims.category,
      description: expenseClaims.description,
      amount: expenseClaims.amount
    })
    .from(expenseClaims)
    .leftJoin(profiles, eq(profiles.id, expenseClaims.employeeId))
    .where(and(...conditions))
    .orderBy(asc(profiles.fullName), asc(expenseClaims.expenseDate))

  if (rows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No approved claims are waiting to be paid.' })
  }

  // Titled by the month the report is RUN in, not the months the individual
  // expenses fall in - see the assumption flagged earlier in this build.
  const reportMonthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const pdfBuffer = await generateExpenseReportPdf(
    rows.map(r => ({
      employeeName: r.employeeName ?? r.employeeEmail ?? 'Unknown employee',
      expenseDate: r.expenseDate,
      category: r.category,
      description: r.description,
      amount: r.amount
    })),
    reportMonthLabel
  )

  const totalAmount = rows.reduce((sum, r) => sum + Number(r.amount), 0)
  const pdfKey = buildObjectKey('expense-claims', `payout-report-${Date.now()}.pdf`)
  await putObject(pdfKey, pdfBuffer, 'application/pdf')

  const [batch] = await db
    .insert(expensePayoutBatches)
    .values({
      runBy: profile.id,
      claimCount: rows.length,
      totalAmount: totalAmount.toFixed(2),
      pdfKey
    })
    .returning()

  if (!batch) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create payout batch' })
  }

  await db
    .update(expenseClaims)
    .set({ status: 'paid', paidBatchId: batch.id, updatedAt: new Date() })
    .where(and(inArray(expenseClaims.id, rows.map(r => r.id)), eq(expenseClaims.status, 'approved')))

  const pdfUrl = await getDownloadUrl(pdfKey)

  return { ...batch, pdfUrl }
})
