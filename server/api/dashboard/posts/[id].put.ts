import { useDb } from '~~/server/db/client'
import { editPost, parsePostParam, postBodyProblem, postHttpError, postTextBodySchema } from '~~/server/utils/posts'

// Authors edit the text of their own posts.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  const parsed = postTextBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: postBodyProblem(parsed) })
  try {
    await editPost(useDb(), profile.id, parsePostParam(event), parsed.data.body)
    return { ok: true }
  } catch (err) {
    postHttpError(err)
  }
})
