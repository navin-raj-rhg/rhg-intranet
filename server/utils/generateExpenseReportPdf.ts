import PDFDocument from 'pdfkit'
import { formatDateMY } from '~~/shared/utils/dates'
import { EXPENSE_CATEGORY_LABELS } from '~~/shared/utils/expenseCategories'

export interface ExpenseReportRow {
  employeeName: string
  expenseDate: string // 'YYYY-MM-DD'
  category: string
  description: string
  amount: string // e.g. '45.00' - numeric columns come back as strings from postgres-js
}

const COLUMNS = [
  { label: 'Date', x: 50, width: 65 },
  { label: 'Category', x: 120, width: 135 },
  { label: 'Description', x: 260, width: 190 },
  { label: 'Amount', x: 450, width: 80 }
] as const

const PAGE_RIGHT_EDGE = 530
const PAGE_LEFT_EDGE = 50

/**
 * NOTE / known simplification: each row is drawn assuming a single line of
 * text per cell. A very long description will wrap and can visually crowd
 * the next row, since row spacing isn't measured per-cell height. Fine for
 * typical short expense descriptions; worth revisiting if that turns out
 * not to hold in practice.
 */
export async function generateExpenseReportPdf(rows: ExpenseReportRow[], reportMonthLabel: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageBottom = doc.page.height - doc.page.margins.bottom

    function ensureSpace(neededHeight: number) {
      if (doc.y + neededHeight > pageBottom) {
        doc.addPage()
      }
    }

    function drawTableHeader() {
      doc.font('Helvetica-Bold').fontSize(10)
      const y = doc.y
      for (const col of COLUMNS) {
        doc.text(col.label, col.x, y, { width: col.width })
      }
      doc.moveDown(0.5)
      doc.moveTo(PAGE_LEFT_EDGE, doc.y).lineTo(PAGE_RIGHT_EDGE, doc.y).stroke()
      doc.moveDown(0.3)
      doc.font('Helvetica').fontSize(10)
    }

    doc.font('Helvetica-Bold').fontSize(16).text(`Employee Expense Claim — ${reportMonthLabel}`)
    doc.moveDown(1)

    // Group by employee, preserving the order the rows arrived in (the
    // caller sorts by employee name, then date, before calling this).
    const byEmployee = new Map<string, ExpenseReportRow[]>()
    for (const row of rows) {
      if (!byEmployee.has(row.employeeName)) byEmployee.set(row.employeeName, [])
      byEmployee.get(row.employeeName)!.push(row)
    }

    let grandTotal = 0

    for (const [employeeName, employeeRows] of byEmployee) {
      ensureSpace(80)
      doc.font('Helvetica-Bold').fontSize(12).text(employeeName)
      doc.moveDown(0.3)
      drawTableHeader()

      let subtotal = 0
      for (const row of employeeRows) {
        ensureSpace(20)
        const y = doc.y
        doc.text(formatDateMY(row.expenseDate), COLUMNS[0].x, y, { width: COLUMNS[0].width })
        doc.text(EXPENSE_CATEGORY_LABELS[row.category] ?? row.category, COLUMNS[1].x, y, { width: COLUMNS[1].width })
        doc.text(row.description, COLUMNS[2].x, y, { width: COLUMNS[2].width })
        doc.text(`RM ${row.amount}`, COLUMNS[3].x, y, { width: COLUMNS[3].width, align: 'right' })
        doc.moveDown(0.8)
        subtotal += Number(row.amount)
      }

      grandTotal += subtotal
      doc.font('Helvetica-Bold')
      doc.text(`Subtotal: RM ${subtotal.toFixed(2)}`, PAGE_LEFT_EDGE, doc.y, {
        width: PAGE_RIGHT_EDGE - PAGE_LEFT_EDGE,
        align: 'right'
      })
      doc.moveDown(1.2)
      doc.font('Helvetica')
    }

    ensureSpace(40)
    doc.moveTo(PAGE_LEFT_EDGE, doc.y).lineTo(PAGE_RIGHT_EDGE, doc.y).stroke()
    doc.moveDown(0.5)
    doc.font('Helvetica-Bold').fontSize(12).text(`Grand Total: RM ${grandTotal.toFixed(2)}`, PAGE_LEFT_EDGE, doc.y, {
      width: PAGE_RIGHT_EDGE - PAGE_LEFT_EDGE,
      align: 'right'
    })

    doc.end()
  })
}
