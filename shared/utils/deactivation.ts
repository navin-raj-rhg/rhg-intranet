/**
 * Pure rules for deactivating people (Step 13.7), shared by the server and
 * tested without a database. Deactivating keeps all of a person's history; it
 * only stops them using the app and hides them from pickers and lists.
 */

export interface ManagedTeam {
  toolName: string
  /** Names of this person's employees who are still active. */
  employeeNames: string[]
}

export interface DeactivationCheck {
  name: string
  isOwner: boolean
  isSelf: boolean
  /** One entry per tool where they still manage active employees. */
  teams: ManagedTeam[]
}

/** Plain-English reason a person can't be deactivated, or '' if they can. */
export function deactivationProblem(c: DeactivationCheck): string {
  if (c.isOwner) return `${c.name} is an owner, and owners can't be deactivated.`
  if (c.isSelf) return 'You cannot deactivate your own account.'
  const teams = c.teams.filter(t => t.employeeNames.length > 0)
  if (teams.length === 0) return ''
  const where = teams
    .map(t => `${t.employeeNames.join(', ')} in ${t.toolName}`)
    .join('; ')
  return `${c.name} is still the manager of ${where}. Give those employees another manager first, then deactivate.`
}
