// Who may create an account. Pure logic (no DB, no Vue) so the login page and
// tests share it. The database guard (manual-sql/008) applies the same rule
// and is the real protection; this is only for a friendly early message.

/** The company domains allowed to sign up. The database list is the source of truth. */
export const COMPANY_EMAIL_DOMAINS = ['rapidhardwaregroup.com.au', 'ttfs.com.au']

/**
 * An allowed entry is either a whole domain ("company.com") or one exact
 * address ("jane@other.com"). Case and surrounding spaces never matter.
 * A domain matches only itself, not sub-domains or look-alikes.
 */
export function isSignupEmailAllowed(email: string, allowed: string[]): boolean {
  const address = email.trim().toLowerCase()
  const at = address.lastIndexOf('@')
  if (at <= 0 || at === address.length - 1) return false
  const domain = address.slice(at + 1)

  return allowed.some((entry) => {
    const rule = entry.trim().toLowerCase()
    if (!rule) return false
    return rule.includes('@') ? rule === address : rule === domain
  })
}

/** Plain-English message for the login page. */
export function signupNotAllowedMessage(): string {
  return `Sign-up is limited to RHG email addresses (${COMPANY_EMAIL_DOMAINS.map(d => `@${d}`).join(' or ')}). If you need access, ask the person who manages the intranet.`
}
