import { useDb } from '~~/server/db/client'
import { parsePostParam, postBodyProblem, postHttpError, postReactBodySchema, toggleCommentReaction } from '~~/server/utils/posts'

// Give a reaction to a comment, or take it back if you already gave it.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  const parsed = postReactBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: postBodyProblem(parsed) })
  try {
    return await toggleCommentReaction(useDb(), profile.id, parsePostParam(event, 'commentId', 'comment'), parsed.data.emoji)
  } catch (err) {
    postHttpError(err)
  }
})
