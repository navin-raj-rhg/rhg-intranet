import { useDb } from '~~/server/db/client'
import { addComment, parsePostParam, postBodyProblem, postHttpError, postTextBodySchema } from '~~/server/utils/posts'

// Anyone signed in can comment.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  const parsed = postTextBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: postBodyProblem(parsed) })
  try {
    return await addComment(useDb(), profile.id, parsePostParam(event), parsed.data.body)
  } catch (err) {
    postHttpError(err)
  }
})
