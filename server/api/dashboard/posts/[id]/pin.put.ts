import { useDb } from '~~/server/db/client'
import { parsePostParam, postBodyProblem, postHttpError, postPinBodySchema, setPostPinned } from '~~/server/utils/posts'

// Owner only: pin a post to the top (one at a time) or unpin it.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const parsed = postPinBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: postBodyProblem(parsed) })
  try {
    await setPostPinned(useDb(), parsePostParam(event), parsed.data.pinned)
    return { ok: true }
  } catch (err) {
    postHttpError(err)
  }
})
