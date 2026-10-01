import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'
import { listOrphans } from '~~/server/utils/storageCleanup'

// Owner-only. Files in R2 that no record points to any more (and are over a day
// old). Nothing is deleted here - the owner reviews the list first.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const orphans = await listOrphans(useDb())

  return {
    totalCount: orphans.length,
    totalBytes: orphans.reduce((sum, o) => sum + o.size, 0),
    // The screen only shows and deletes the first batch; run it again for more.
    items: orphans.slice(0, 200).map(o => ({
      key: o.key,
      size: o.size,
      lastModified: new Date(o.lastModified).toISOString()
    }))
  }
})
