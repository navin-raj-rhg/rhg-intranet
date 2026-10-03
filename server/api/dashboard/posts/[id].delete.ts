import { useDb } from '~~/server/db/client'
import { deletePost, parsePostParam, postHttpError } from '~~/server/utils/posts'

// Authors delete their own posts; the owner deletes anyone's.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  try {
    await deletePost(useDb(), profile, parsePostParam(event))
    return { ok: true }
  } catch (err) {
    postHttpError(err)
  }
})
