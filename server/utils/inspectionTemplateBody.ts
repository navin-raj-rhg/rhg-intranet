import { z } from 'zod'
import { inspectionTemplateProblems, INSPECTION_NAME_MAX } from '~~/shared/utils/inspectionRules'

export const templateBodySchema = z.object({
  name: z.string({ message: 'The template needs a name' }).max(INSPECTION_NAME_MAX * 2),
  active: z.boolean().default(true),
  sections: z
    .array(z.object({
      name: z.string().max(INSPECTION_NAME_MAX * 2),
      points: z.array(z.object({ text: z.string().max(500, 'An inspection point is too long (500 characters at most)') })).max(200)
    }))
    .max(50, 'That is too many sections (50 at most)')
})

/** First plain-English problem with a template body, or '' if it's fine. */
export function templateBodyProblem(parsed: ReturnType<typeof templateBodySchema.safeParse>): string {
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Invalid template.'
  return inspectionTemplateProblems(parsed.data.name, parsed.data.sections)[0] ?? ''
}
