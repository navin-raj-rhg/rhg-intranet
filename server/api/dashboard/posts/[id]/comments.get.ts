import { useDb } from '~~/server/db/client'
import { listComments, parsePostParam, postHttpError } from '~~/server/utils/posts'

// The comments on one post, oldest first.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  try {
    return await listComments(useDb(), profile, parsePostParam(event))
  } catch (err) {
    postHttpError(err)
  }
})
