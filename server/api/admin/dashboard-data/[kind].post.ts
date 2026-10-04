import { useDb } from '~~/server/db/client'
import { bodyProblem } from '~~/server/utils/projectBodies'
import { CHART_KINDS, chartUploadSchema, uploadChartData, type ChartKind } from '~~/server/utils/dashboardCharts'

// The owner uploads a CSV for the sales or goals chart. With `apply: false` it only checks the file;
// with `apply: true` it replaces all existing data for that chart.
export default defineEventHandler(async (event) => {
  const profile = await requireOwner(event)
  const kind = getRouterParam(event, 'kind') as ChartKind
  if (!CHART_KINDS.includes(kind)) throw createError({ statusCode: 404, statusMessage: 'Unknown chart.' })
  const parsed = chartUploadSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  return await uploadChartData(useDb(), profile.id, kind, parsed.data)
})
