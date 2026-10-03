import { useDb } from '~~/server/db/client'
import { listPosts } from '~~/server/utils/posts'

// One page of dashboard posts (pinned first, then newest). ?before=<post id> loads older ones.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  const raw = Number(getQuery(event).before)
  const before = Number.isInteger(raw) && raw > 0 ? raw : null
  return await listPosts(useDb(), profile, before)
})
