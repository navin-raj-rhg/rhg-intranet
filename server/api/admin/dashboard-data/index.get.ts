import { useDb } from '~~/server/db/client'
import { loadChartUploads } from '~~/server/utils/dashboardCharts'

// When the Sales and Goals data were last uploaded, for the owner's upload screen.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  return await loadChartUploads(useDb())
})
