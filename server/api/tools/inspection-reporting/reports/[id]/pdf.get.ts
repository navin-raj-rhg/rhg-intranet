import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { generateInspectionReportPdf } from '~~/server/utils/generateInspectionReportPdf'
import {
  getInspectionReport,
  INSPECTION_ROLES,
  INSPECTION_TOOL_ID,
  loadInspectionPdfPhotos,
  parseInspectionId
} from '~~/server/utils/inspections'

// The report as a PDF (any status; a draft or in-review PDF says it isn't final).
// Anyone with the tool can download any report, since everyone can see every report.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, INSPECTION_TOOL_ID, INSPECTION_ROLES)
  const id = parseInspectionId(event)
  const db = useDb()

  const report = await getInspectionReport(db, id, profile.id, roles)
  if (!report) throw createError({ statusCode: 404, statusMessage: 'That inspection report no longer exists.' })

  const photos = await loadInspectionPdfPhotos(db, id)
  const pdf = await generateInspectionReportPdf(report, photos)

  const safeName = report.locationName.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'report'
  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="inspection-${id}-${safeName}.pdf"`,
    'Cache-Control': 'no-store'
  })
  return pdf
})
