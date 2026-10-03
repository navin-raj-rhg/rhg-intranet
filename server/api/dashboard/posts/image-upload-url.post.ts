import { createPostImageUpload, postBodyProblem, postHttpError, postImageUploadBodySchema } from '~~/server/utils/posts'

// Step 1 of adding an image: if it is an allowed image within the size limit, the
// browser gets a short-lived link that accepts a file of exactly that size.
export default defineEventHandler(async (event) => {
  await requireProfile(event)
  const parsed = postImageUploadBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: postBodyProblem(parsed) })
  try {
    return await createPostImageUpload(parsed.data)
  } catch (err) {
    postHttpError(err)
  }
})
