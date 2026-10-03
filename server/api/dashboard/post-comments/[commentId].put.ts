import { useDb } from '~~/server/db/client'
import { editComment, parsePostParam, postBodyProblem, postHttpError, postTextBodySchema } from '~~/server/utils/posts'

// Authors edit their own comments.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  const parsed = postTextBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: postBodyProblem(parsed) })
  try {
    await editComment(useDb(), profile.id, parsePostParam(event, 'commentId', 'comment'), parsed.data.body)
    return { ok: true }
  } catch (err) {
    postHttpError(err)
  }
})
