import PDFDocument from 'pdfkit'
import type { CostModelDetail, CostModelSavedRow } from '~~/shared/types/costModelling'
import {
  CONTAINER_LABELS,
  PACK_LEVEL_LABELS,
  containerCostAud,
  formatAud,
  formatPercent
} from '~~/shared/utils/costModel'
import { formatDateMY, todayMY } from '~~/shared/utils/dates'

/**
 * A saved cost model as a landscape A4 PDF: header details, the Factors it was
 * costed with, one row of figures per product (exactly as saved - nothing is
 * recalculated), landed cost at every AU port, tooling and any warnings.
 * Built-in PDF fonts only, so non-Western text prints as "?" (same as the
 * inspection PDF).
 */

const MARGIN = 26
const NAVY = '#14213D'
const MUTED = '#666666'
const LINE = '#cccccc'
const RED = '#b91c1c'
const ROW_HEIGHT = 11

interface Column {
  label: string
  width: number
  align?: 'left' | 'right'
}

interface TableOptions {
  /** Columns whose negative values (margins) are drawn in red. */
  redCols?: number[]
  /** Cells drawn in bold (e.g. the most expensive port). */
  bold?: (row: number, col: number) => boolean
}

const num = (n: number | null | undefined) => (n === null || n === undefined ? '-' : n.toLocaleString('en-AU'))

// The built-in PDF fonts cannot draw every symbol, so use plain characters.
const plain = (s: string) => s.replace(/—/g, '-').replace(/·/g, '|')
const dashIfNone = (s: string) => (s === '—' ? '-' : s)

export async function generateCostModelPdf(model: CostModelDetail): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = MARGIN
    const usable = doc.page.width - MARGIN * 2
    const pageBottom = () => doc.page.height - MARGIN - 14
    const snap = model.factorsSnapshot
    const basis = model.containerBasis
    const ports = snap.destinations.map(d => d.port)

    function ensureSpace(height: number, redrawHeader?: () => void) {
      if (doc.y + height > pageBottom()) {
        doc.addPage()
        redrawHeader?.()
      }
    }

    function heading(text: string) {
      ensureSpace(50)
      doc.y += 10
      doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(text, left, doc.y, { width: usable })
      doc.y += 4
      doc.fillColor('black')
    }

    function note(text: string) {
      doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(text, left, doc.y + 3, { width: usable })
      doc.fillColor('black')
    }

    /** A table whose rows are single lines (long text is cut with "..."). */
    function table(columns: Column[], rows: string[][], opts: TableOptions = {}) {
      const total = columns.reduce((sum, c) => sum + c.width, 0)
      const scale = usable / total
      const widths = columns.map(c => c.width * scale)

      const drawRow = (cells: string[], header: boolean, rowIndex: number) => {
        const y = doc.y
        let x = left
        cells.forEach((cell, i) => {
          const col = columns[i]!
          const negative = !header && opts.redCols?.includes(i) && cell.startsWith('-') && cell !== '-'
          const bold = header || opts.bold?.(rowIndex, i)
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
          doc.fillColor(header ? NAVY : negative ? RED : 'black')
          doc.text(plain(cell), x + 2, y, { width: widths[i]! - 4, align: col.align ?? 'left', lineBreak: false, ellipsis: true })
          x += widths[i]!
        })
        doc.fillColor('black')
        doc.y = y + ROW_HEIGHT
      }

      const drawHeader = () => {
        drawRow(columns.map(c => c.label), true, -1)
        doc.moveTo(left, doc.y).lineTo(left + usable, doc.y).strokeColor(LINE).lineWidth(0.5).stroke()
        doc.y += 3
      }

      drawHeader()
      rows.forEach((cells, r) => {
        ensureSpace(ROW_HEIGHT + 2, drawHeader)
        drawRow(cells, false, r)
        doc.moveTo(left, doc.y - 1).lineTo(left + usable, doc.y - 1).strokeColor('#eeeeee').lineWidth(0.3).stroke()
      })
    }

    /* ---- title + header details ---- */
    doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY).text(plain(model.name), left, MARGIN, { width: usable })
    const savedOn = formatDateMY(todayMY(new Date(model.createdAt)))
    const copied = model.duplicatedFrom ? ` - copied from ${model.duplicatedFrom.name}` : ''
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    doc.text(plain(`Saved by ${model.createdByName} on ${savedOn}${copied}`), left, doc.y + 2, { width: usable })

    const details: [string, string][] = [
      ['Supplier', model.supplierName],
      ['Category', model.categoryName],
      ['Sub-category', model.subCategoryName || '-'],
      ['Ship from', snap.originPort.name],
      ['Landed cost basis', `${CONTAINER_LABELS[basis]} container`]
    ]
    const cellWidth = usable / details.length
    const detailsTop = doc.y + 12
    details.forEach(([label, value], i) => {
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label, left + i * cellWidth, detailsTop, { width: cellWidth - 6 })
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black')
        .text(plain(value), left + i * cellWidth, detailsTop + 10, { width: cellWidth - 6, lineBreak: false, ellipsis: true })
    })
    doc.y = detailsTop + 28

    if (model.notes) {
      doc.font('Helvetica').fontSize(8.5).fillColor('black').text(plain(`Notes: ${model.notes}`), left, doc.y + 4, { width: usable })
    }

    /* ---- factors ---- */
    heading('Factors used')
    const asAt = formatDateMY(todayMY(new Date(snap.capturedAt)))
    doc.font('Helvetica').fontSize(8).fillColor('black').text(
      `1 USD = ${snap.usdToAud} AUD   |   1 CNY = ${snap.cnyToAud} AUD   |   usable volume: 20' ${snap.containerCbm.c20} m3, 40HC ${snap.containerCbm.c40hc} m3   |   as at ${asAt}`,
      left, doc.y, { width: usable }
    )
    doc.y += 6
    table(
      [
        { label: `${snap.originPort.name} to`, width: 170 },
        { label: 'Freight USD 20\'', width: 100, align: 'right' },
        { label: 'Freight USD 40HC', width: 100, align: 'right' },
        { label: 'Local AUD 20\'', width: 100, align: 'right' },
        { label: 'Local AUD 40HC', width: 100, align: 'right' },
        { label: 'Total AUD 20\'', width: 100, align: 'right' },
        { label: 'Total AUD 40HC', width: 100, align: 'right' }
      ],
      snap.destinations.map(d => [
        d.port,
        formatAud(d.freightUsd.c20),
        formatAud(d.freightUsd.c40hc),
        formatAud(d.localAud.c20),
        formatAud(d.localAud.c40hc),
        formatAud(containerCostAud(d, 'c20', snap.usdToAud)),
        formatAud(containerCostAud(d, 'c40hc', snap.usdToAud))
      ])
    )

    /* ---- products ---- */
    const productRows = (rows: CostModelSavedRow[]) => rows.map(row => [
      row.productNo || '-',
      row.description || '-',
      row.results.packing.shippingLevel
        ? `${PACK_LEVEL_LABELS[row.results.packing.shippingLevel]} of ${num(row.results.packing.shippingUnits)}`
        : '-',
      num(row.results.unitsPer.c20),
      num(row.results.unitsPer.c40hc),
      `${row.fobCurrency} ${formatAud(row.fobPrice)}`,
      row.dutyPercent ? `${row.dutyPercent}%` : '-',
      dashIfNone(formatAud(row.results.netCogsAud)),
      dashIfNone(formatAud(row.results.shippingPerUnit[basis])),
      dashIfNone(formatAud(row.results.landedAud)),
      dashIfNone(formatAud(row.buyerBuyPrice)),
      dashIfNone(formatPercent(row.results.rapidMargin)),
      dashIfNone(formatAud(row.rrpIncGst)),
      dashIfNone(formatAud(row.results.rrpExGst)),
      dashIfNone(formatPercent(row.results.buyerMargin))
    ])

    heading(`Products (${model.rows.length}) - figures as saved, AUD (shipping and landed cost for the ${CONTAINER_LABELS[basis]} container)`)
    table(
      [
        { label: 'No.', width: 55 },
        { label: 'Description', width: 100 },
        { label: 'Ships as', width: 60 },
        { label: 'Units/20\'', width: 40, align: 'right' },
        { label: 'Units/40HC', width: 40, align: 'right' },
        { label: 'FOB', width: 55, align: 'right' },
        { label: 'Duty', width: 35, align: 'right' },
        { label: 'Net COGS', width: 55, align: 'right' },
        { label: 'Ship/unit', width: 55, align: 'right' },
        { label: 'Landed', width: 60, align: 'right' },
        { label: 'Buyer buy', width: 50, align: 'right' },
        { label: 'Rapid GM', width: 45, align: 'right' },
        { label: 'RRP', width: 45, align: 'right' },
        { label: 'RRP ex GST', width: 50, align: 'right' },
        { label: 'Buyer GM', width: 45, align: 'right' }
      ],
      productRows(model.rows),
      { redCols: [11, 14] }
    )
    note('Shipping per unit and margins use the most expensive AU port for the chosen origin. Buyer GM is on RRP ex GST. Tooling is shown separately and is not in unit cost.')

    /* ---- landed cost per port ---- */
    if (ports.length) {
      heading(`Landed cost per AU port (AUD, ${CONTAINER_LABELS[basis]} container)`)
      table(
        [
          { label: 'No.', width: 70 },
          { label: 'Description', width: 150 },
          ...ports.map(p => ({ label: p, width: 70, align: 'right' as const }))
        ],
        model.rows.map(row => [
          row.productNo || '-',
          row.description || '-',
          ...ports.map(p => dashIfNone(formatAud(row.results.landedByPort.find(l => l.port === p)?.landedAud ?? null)))
        ]),
        { bold: (r, c) => c >= 2 && model.rows[r]?.results.landedPort === ports[c - 2] }
      )
      note('Bold = the most expensive port (the one the margins use).')
    }

    /* ---- tooling + warnings ---- */
    const tooling = model.rows.filter(r => r.toolingCost)
    if (tooling.length) {
      heading('Tooling (one-off)')
      table(
        [
          { label: 'No.', width: 70 },
          { label: 'Description', width: 200 },
          { label: 'Tooling (supplier currency)', width: 130, align: 'right' },
          { label: 'Tooling AUD', width: 100, align: 'right' }
        ],
        tooling.map(r => [
          r.productNo || '-',
          r.description || '-',
          `${r.fobCurrency} ${formatAud(r.toolingCost, 0)}`,
          dashIfNone(formatAud(r.results.toolingAud, 0))
        ])
      )
    }

    const warned = model.rows.filter(r => r.results.issues.length)
    if (warned.length) {
      heading('Warnings')
      doc.font('Helvetica').fontSize(8).fillColor('black')
      for (const r of warned) {
        ensureSpace(14)
        doc.text(plain(`${r.productNo || 'Product'}: ${r.results.issues.join(' · ')}`), left, doc.y, { width: usable })
      }
    }

    /* ---- footer on every page ---- */
    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i)
      // The footer sits inside the bottom margin; zero it so pdfkit doesn't add a page for it.
      const bottomMargin = doc.page.margins.bottom
      doc.page.margins.bottom = 0
      doc.font('Helvetica').fontSize(7).fillColor(MUTED)
      doc.text(`${plain(model.name)}  |  Page ${i + 1} of ${range.count}`, left, doc.page.height - MARGIN + 4, {
        width: usable,
        align: 'right',
        lineBreak: false
      })
      doc.page.margins.bottom = bottomMargin
    }

    doc.end()
  })
}
