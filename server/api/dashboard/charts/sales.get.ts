import { useDb } from '~~/server/db/client'
import { loadSalesChart } from '~~/server/utils/dashboardCharts'

// Figures for the Sales overview tile. Anyone signed in; `summary` is null until the owner uploads data.
export default defineEventHandler(async (event) => {
  await requireProfile(event)
  return await loadSalesChart(useDb())
})
