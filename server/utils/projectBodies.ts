import { z } from 'zod'
import { PROJECT_NAME_MAX, PROJECT_TEXT_MAX, PROJECT_TITLE_MAX } from '~~/shared/utils/projectRules'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be real dates.')
const optionalText = z.string().max(PROJECT_TEXT_MAX, `That text is too long (${PROJECT_TEXT_MAX} characters at most).`).nullable().optional()
const personId = z.string().uuid('Pick a person from the list.')

export const projectTypeBodySchema = z.object({
  name: z.string({ message: 'The type needs a name' }).max(PROJECT_NAME_MAX * 2),
  active: z.boolean().default(true)
})

export const projectTemplateBodySchema = z.object({
  tasks: z
    .array(z.object({
      key: z.string().min(1).max(64),
      id: z.number().int().positive().optional(),
      title: z.string().max(PROJECT_TITLE_MAX * 2),
      description: optionalText,
      assigneeId: personId.nullable().optional(),
      leadTimeDays: z.number(),
      active: z.boolean().default(true),
      typeIds: z.array(z.number().int().positive()).max(100),
      dependsOn: z.array(z.string().min(1).max(64)).max(200)
    }))
    .max(500, 'That is too many tasks (500 at most).')
})

export const createProjectBodySchema = z.object({
  name: z.string({ message: 'The project needs a name' }).max(PROJECT_NAME_MAX * 2),
  typeId: z.number().int().positive().nullable().default(null),
  startDate: isoDate,
  targetDate: isoDate.nullable().optional(),
  products: optionalText,
  notes: optionalText,
  memberIds: z.array(personId).max(200).default([])
})

export const updateProjectBodySchema = z.object({
  name: z.string({ message: 'The project needs a name' }).max(PROJECT_NAME_MAX * 2),
  targetDate: isoDate.nullable().optional(),
  products: optionalText,
  notes: optionalText,
  ownerId: personId
})

export const membersBodySchema = z.object({ memberIds: z.array(personId).max(200) })

export const projectStatusBodySchema = z.object({ status: z.enum(['open', 'closed']) })

export const newTaskBodySchema = z.object({
  title: z.string({ message: 'The task needs a title' }).max(PROJECT_TITLE_MAX * 2),
  description: optionalText,
  assigneeId: personId.nullable().optional(),
  leadTimeDays: z.number(),
  dependsOn: z.array(z.number().int().positive()).max(200).default([])
})

export const taskStatusBodySchema = z.object({ status: z.enum(['todo', 'in_progress', 'done']) })

export const commentBodySchema = z.object({
  body: z.string({ message: 'Write a comment first' }).max(PROJECT_TEXT_MAX, `That comment is too long (${PROJECT_TEXT_MAX} characters at most).`)
})

/** First plain-English message from a failed parse. */
export function bodyProblem(parsed: { success: boolean, error?: { issues: { message: string }[] } }): string {
  return parsed.success ? '' : (parsed.error?.issues[0]?.message ?? 'That request was not valid.')
}
