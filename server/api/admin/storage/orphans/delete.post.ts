import { z } from 'zod'
import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'
import { deleteOrphans } from '~~/server/utils/storageCleanup'

const bodySchema = z.object({ keys: z.array(z.string().min(1)).min(1).max(200) })

// Owner-only. Permanently deletes the listed files from R2. Each one is checked
// again first, so anything that is now in use, too recent or outside a tool's
// folder is skipped rather than deleted.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choose the files to delete (up to 200 at a time).' })
  return deleteOrphans(useDb(), parsed.data.keys)
})
