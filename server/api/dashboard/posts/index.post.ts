import { useDb } from '~~/server/db/client'
import { createPost, postBodyProblem, postCreateBodySchema, postHttpError } from '~~/server/utils/posts'

// Anyone signed in can post.
export default defineEventHandler(async (event) => {
  const profile = await requireProfile(event)
  const parsed = postCreateBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: postBodyProblem(parsed) })
  try {
    return await createPost(useDb(), profile.id, parsed.data)
  } catch (err) {
    postHttpError(err)
  }
})
