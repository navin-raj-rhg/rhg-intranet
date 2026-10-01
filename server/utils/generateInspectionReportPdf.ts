import PDFDocument from 'pdfkit'
import type { InspectionReportView } from '~~/shared/types/inspection'
import { INSPECTION_OVERALL_LABELS, INSPECTION_STATUS_LABELS, type InspectionOverall } from '~~/shared/utils/inspectionRules'
import { formatDateMY, formatDateTimeMY } from '~~/shared/utils/dates'

/** A photo's picture data, ready to place in the PDF. `buffer` is null when it can't be shown (too big a report, or an unsupported type). */
export interface InspectionPdfPhoto {
  buffer: Buffer | null
  contentType: string
  fileName: string
}

const LEFT = 40
const RIGHT = 555
const WIDTH = RIGHT - LEFT

const COLORS = {
  text: '#111827',
  muted: '#6b7280',
  line: '#d1d5db',
  green: '#15803d',
  red: '#b91c1c',
  amber: '#b45309',
  grey: '#4b5563'
}

const OVERALL_COLOR: Record<InspectionOverall, string> = {
  pass: COLORS.green,
  pass_with_conditions: COLORS.amber,
  fail: COLORS.red
}

const EVENT_LABELS: Record<string, string> = {
  created: 'Started',
  submitted: 'Submitted for review',
  returned: 'Sent back for changes',
  closed: 'Closed'
}

/**
 * The built-in PDF fonts only cover Western characters. Anything else (for
 * example Chinese) would print as garbage, so it is shown as "?" instead.
 */
function pdfText(value: string | null | undefined): string {
  return Array.from(value ?? '')
    .map(ch => (ch.codePointAt(0)! <= 0xFF || '–—‘’“”•…€™'.includes(ch) ? ch : '?'))
    .join('')
}

/** One A4 report: header, products, every checklist point with its answer, comment and photos, then the history. */
export async function generateInspectionReportPdf(
  report: InspectionReportView,
  photos: Map<number, InspectionPdfPhoto>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageBottom = () => doc.page.height - doc.page.margins.bottom - 10

    function ensureSpace(height: number) {
      if (doc.y + height > pageBottom()) doc.addPage()
    }

    function rule() {
      doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor(COLORS.line).lineWidth(0.5).stroke()
    }

    // ---- Title ----
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(18).text(`Inspection Report #${report.id}`, LEFT, 40)
    doc.moveDown(0.2)
    const resultLabel = report.status === 'draft'
      ? 'Draft - result not final'
      : `${INSPECTION_OVERALL_LABELS[report.overall]}${report.overallIsFinal ? '' : ' (not final)'}`
    doc.font('Helvetica-Bold').fontSize(13)
      .fillColor(report.status === 'draft' ? COLORS.grey : OVERALL_COLOR[report.overall])
      .text(`Result: ${resultLabel}`)
    doc.moveDown(0.6)

    // ---- Key details (two columns) ----
    const details: [string, string][] = [
      [report.locationType === 'dc' ? 'DC' : 'Supplier', report.locationName],
      ['Template', report.templateName],
      ['Inspection date', formatDateMY(report.inspectionDate)],
      ['PO / reference', report.reference || '-'],
      ['Inspector', report.createdByName],
      ['Status', INSPECTION_STATUS_LABELS[report.status]]
    ]
    const colWidth = WIDTH / 2
    let rowTop = doc.y
    for (let i = 0; i < details.length; i += 2) {
      let rowBottom = rowTop
      for (const [offset, [label, value]] of details.slice(i, i + 2).entries()) {
        const x = LEFT + offset * colWidth
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(label.toUpperCase(), x, rowTop, { width: colWidth - 10 })
        doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(10).text(pdfText(value), x, doc.y, { width: colWidth - 10 })
        rowBottom = Math.max(rowBottom, doc.y)
      }
      rowTop = rowBottom + 6
    }
    doc.y = rowTop + 2

    // ---- Products ----
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text('PRODUCTS INSPECTED', LEFT, doc.y)
    doc.moveDown(0.2)
    if (report.products.length === 0) {
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(10).text('-', LEFT, doc.y)
    }
    for (const p of report.products) {
      ensureSpace(16)
      const y = doc.y
      doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(10).text(pdfText(p.productNo), LEFT, y, { width: 130 })
      const noBottom = doc.y
      doc.font('Helvetica').text(pdfText(p.description) || '', LEFT + 140, y, { width: WIDTH - 140 })
      doc.y = Math.max(noBottom, doc.y) + 2
    }

    if (report.notes) {
      doc.moveDown(0.5)
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text('NOTES', LEFT, doc.y)
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(10).text(pdfText(report.notes), LEFT, doc.y, { width: WIDTH })
    }

    // ---- Summary ----
    doc.moveDown(0.8)
    rule()
    doc.moveDown(0.4)
    const t = report.tally
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(10).text(
      `${t.total} inspection points: ${t.compliant} compliant, ${t.minor} minor non-conformance${t.minor === 1 ? '' : 's'}, `
      + `${t.major} major non-conformance${t.major === 1 ? '' : 's'}, ${t.na} N/A${t.unanswered ? `, ${t.unanswered} not answered` : ''}.`,
      LEFT,
      doc.y,
      { width: WIDTH }
    )
    doc.moveDown(0.8)

    // ---- Checklist ----
    const sections: { name: string, points: InspectionReportView['points'] }[] = []
    for (const p of report.points) {
      let s = sections.find(x => x.name === p.sectionName)
      if (!s) {
        s = { name: p.sectionName, points: [] }
        sections.push(s)
      }
      s.points.push(p)
    }

    const THUMB = 112
    const GAP = 8

    sections.forEach((section, si) => {
      ensureSpace(60)
      doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(12).text(`${si + 1}. ${pdfText(section.name)}`, LEFT, doc.y)
      doc.moveDown(0.2)
      rule()
      doc.moveDown(0.5)

      section.points.forEach((p, pi) => {
        ensureSpace(60)
        const startY = doc.y
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(`${si + 1}.${pi + 1}`, LEFT, startY, { width: 28 })
        doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(10).text(pdfText(p.pointText), LEFT + 30, startY, { width: WIDTH - 30 })

        let label = 'Not answered'
        let color = COLORS.muted
        if (p.result === 'compliant') {
          label = 'Compliant'
          color = COLORS.green
        } else if (p.result === 'na') {
          label = 'N/A'
          color = COLORS.grey
        } else if (p.result === 'non_conformance') {
          label = `Non-Conformance${p.severity ? ` - ${p.severity === 'major' ? 'Major' : 'Minor'}` : ''}`
          color = p.severity === 'major' ? COLORS.red : COLORS.amber
        }
        doc.fillColor(color).font('Helvetica-Bold').fontSize(10).text(label, LEFT + 30, doc.y + 1, { width: WIDTH - 30 })

        if (p.comment) {
          doc.fillColor(COLORS.text).font('Helvetica').fontSize(10).text(pdfText(p.comment), LEFT + 30, doc.y + 2, { width: WIDTH - 30 })
        }

        // Photos in a grid under the point.
        if (p.photos.length) {
          doc.y += 6
          let x = LEFT + 30
          let rowTop = doc.y
          for (const ph of p.photos) {
            if (x + THUMB > RIGHT) {
              x = LEFT + 30
              rowTop += THUMB + GAP
            }
            if (rowTop + THUMB > pageBottom()) {
              doc.addPage()
              x = LEFT + 30
              rowTop = doc.y
            }
            const picture = photos.get(ph.id)
            let drawn = false
            if (picture?.buffer) {
              try {
                doc.image(picture.buffer, x, rowTop, { fit: [THUMB, THUMB], align: 'center', valign: 'center' })
                doc.rect(x, rowTop, THUMB, THUMB).strokeColor(COLORS.line).lineWidth(0.5).stroke()
                drawn = true
              } catch {
                drawn = false
              }
            }
            if (!drawn) {
              doc.rect(x, rowTop, THUMB, THUMB).strokeColor(COLORS.line).lineWidth(0.5).stroke()
              doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(
                `Photo not shown in the PDF:\n${pdfText(ph.fileName)}\n(view it in the app)`,
                x + 6,
                rowTop + 6,
                { width: THUMB - 12 }
              )
            }
            x += THUMB + GAP
          }
          doc.y = rowTop + THUMB + GAP
        }
        doc.x = LEFT
        doc.moveDown(0.8)
      })
    })

    // ---- History ----
    ensureSpace(80)
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(12).text('History', LEFT, doc.y)
    doc.moveDown(0.2)
    rule()
    doc.moveDown(0.4)
    for (const e of report.events) {
      ensureSpace(34)
      doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(10).text(EVENT_LABELS[e.action] ?? e.action, LEFT, doc.y, { continued: true })
      doc.font('Helvetica').fillColor(COLORS.muted).text(`  ${pdfText(e.actorName)} - ${formatDateTimeMY(new Date(e.createdAt))}`)
      if (e.comment) doc.fillColor(COLORS.text).font('Helvetica-Oblique').text(`"${pdfText(e.comment)}"`, LEFT + 10, doc.y, { width: WIDTH - 10 })
      doc.moveDown(0.4)
    }

    // ---- Footer on every page ----
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      doc.page.margins.bottom = 0 // so writing in the footer doesn't start a new page
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(
        `Inspection Report #${report.id} - ${pdfText(report.locationName)} - generated ${formatDateTimeMY(new Date())}      Page ${i + 1} of ${range.count}`,
        LEFT,
        doc.page.height - 28,
        { width: WIDTH, align: 'center', lineBreak: false }
      )
    }

    doc.end()
  })
}
