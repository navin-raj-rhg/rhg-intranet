import { useDb } from '~~/server/db/client'
import { loadGoalsChart } from '~~/server/utils/dashboardCharts'

// Figures for the Goals overview tile. Anyone signed in; empty until the owner uploads data.
export default defineEventHandler(async (event) => {
  await requireProfile(event)
  return await loadGoalsChart(useDb())
})
