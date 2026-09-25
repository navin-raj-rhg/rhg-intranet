import { z } from 'zod'
import { buildObjectKey, getUploadUrl } from '~~/server/utils/r2'

const bodySchema = z.object({
  toolId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1)
})

// Any authenticated user can request an upload slot. This only lets someone
// create a NEW object under a tool's prefix - it doesn't grant access to
// read or overwrite anyone else's files. Business-level checks (e.g. "can
// this employee submit an expense claim at all") belong in each tool's own
// submit endpoint, once that tool exists.
export default defineEventHandler(async (event) => {
  await requireProfile(event)

  const body = await readValidatedBody(event, bodySchema.parse)
  const key = buildObjectKey(body.toolId, body.filename)
  const uploadUrl = await getUploadUrl(key, body.contentType)

  return { uploadUrl, key }
})
