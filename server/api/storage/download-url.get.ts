import { z } from 'zod'
import { getDownloadUrl } from '~~/server/utils/r2'

const querySchema = z.object({
  key: z.string().min(1)
})

// IMPORTANT: this only checks that the caller is signed in - it does NOT
// check whether they're allowed to see this specific file. It exists as a
// generic convenience for this scaffold/demo stage, relying on object keys
// being unguessable UUIDs rather than real authorization.
//
// Once a tool has its own database table referencing an R2 key (e.g.
// expense_claims.receipt_key), that tool's own API route should look up the
// record, check the caller's role/ownership via requireProfile() +
// user_tool_roles, and only THEN call getDownloadUrl(key) from
// server/utils/r2.ts directly - not proxy through this generic route.
export default defineEventHandler(async (event) => {
  await requireProfile(event)

  const query = await getValidatedQuery(event, querySchema.parse)
  const downloadUrl = await getDownloadUrl(query.key)

  return { downloadUrl }
})
