import { useDb } from '~~/server/db/client'

export default defineEventHandler(async () => {
  const db = useDb()
  const owner = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.isOwner, true)
  })
  return { ownerExists: !!owner }
})
