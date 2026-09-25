import { useDb } from '~~/server/db/client'
import { toolRegistry } from '~~/server/db/schema'

// Returns every enabled tool. Step 6 will add permission filtering
// (owner sees all; everyone else sees only tools they have a role in,
// via user_tool_roles) and wire this into the launcher page.
export default defineEventHandler(async () => {
  const db = useDb()
  return db.query.toolRegistry.findMany({
    where: (tool, { eq }) => eq(tool.enabled, true)
  })
})
