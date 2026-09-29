import { useDb } from '~~/server/db/client'
import { requireOwner } from '~~/server/utils/requireUser'

// Owner-only. People who have signed up but hold no role in ANY tool yet -
// i.e. they can log in but see nothing. Drives the "new sign-ups waiting"
// alert on the owner's dashboard. The owner themselves is never listed.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const db = useDb()

  const [profiles, roleRows] = await Promise.all([
    db.query.profiles.findMany({
      where: (p, { eq }) => eq(p.isOwner, false),
      orderBy: (p, { desc }) => desc(p.createdAt)
    }),
    db.query.userToolRoles.findMany({ columns: { userId: true } })
  ])

  const withAccess = new Set(roleRows.map(r => r.userId))

  return profiles
    .filter(p => !withAccess.has(p.id))
    .map(p => ({ id: p.id, email: p.email, fullName: p.fullName, createdAt: p.createdAt }))
})
