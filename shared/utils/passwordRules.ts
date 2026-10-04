// Rules for choosing a new password. Pure logic so the change-password dialog,
// the reset page and tests share it. Supabase applies its own minimum as well.

export const MIN_PASSWORD_LENGTH = 8

/** Plain-English reason a new password can't be used, or null when it is fine. */
export function newPasswordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (password !== confirm) {
    return 'The two passwords do not match.'
  }
  return null
}
