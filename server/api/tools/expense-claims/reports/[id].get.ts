import { z } from 'zod'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { useDb } from '~~/server/db/client'
import { getDownloadUrl } from '~~/server/utils/r2'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

export default defineEventHandler(async (event) => {
  await requireToolRole(event, 'expense-claims', ['manager'])
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  const db = useDb()
  const batch = await db.query.expensePayoutBatches.findFirst({
    where: (b, { eq }) => eq(b.id, id)
  })

  if (!batch || !batch.pdfKey) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }

  const pdfUrl = await getDownloadUrl(batch.pdfKey)
  return { pdfUrl }
})
