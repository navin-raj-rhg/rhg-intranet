import { useDb } from '~~/server/db/client'
import { deleteComment, parsePostParam, postHttpError } from '~~/server/utils/posts'

// Authors delete their own comments; the owner deletes anyone's.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  try {
    await deleteComment(useDb(), profile, parsePostParam(event, 'commentId', 'comment'))
    return { ok: true }
  } catch (err) {
    postHttpError(err)
  }
})
