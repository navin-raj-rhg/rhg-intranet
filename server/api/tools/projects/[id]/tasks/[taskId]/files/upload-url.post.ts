import { useDb } from '~~/server/db/client'
import { requireToolRole } from '~~/server/utils/requireToolRole'
import { bodyProblem, fileUploadBodySchema } from '~~/server/utils/projectBodies'
import { createTaskFileUpload, loadProjectAccess, parseProjectId, PROJECTS_ROLES, PROJECTS_TOOL_ID, projectHttpError } from '~~/server/utils/projects'

// Step 1 of attaching a file: the browser says what it wants to upload; if it is
// an allowed kind and within the size limit it gets a short-lived link that
// accepts a file of exactly that size.
export default defineEventHandler(async (event) => {
  const { profile, roles } = await requireToolRole(event, PROJECTS_TOOL_ID, PROJECTS_ROLES)
  const parsed = fileUploadBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: bodyProblem(parsed) })
  const db = useDb()
  try {
    const access = await loadProjectAccess(db, parseProjectId(event), profile.id, roles)
    return await createTaskFileUpload(db, access, parseProjectId(event, 'taskId', 'task'), parsed.data)
  } catch (err) {
    projectHttpError(err)
  }
})
