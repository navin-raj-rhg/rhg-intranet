// Decides whether the server should send a visitor to the login page instead
// of the app. Pure logic (no h3, no Nitro) so it can be unit tested.

// /reset-password is where the emailed "forgot password" link lands; the
// visitor is signed out until the page has read the link's code.
const PUBLIC_PAGES = ['/login', '/reset-password']

/** True for a browser asking for a page (not an API call, script, image or other file). */
export function isPageNavigation(method: string, path: string, accept: string | undefined): boolean {
  if (method !== 'GET') return false
  if (!accept || !accept.includes('text/html')) return false

  const pathOnly = path.split('?')[0] ?? ''
  if (pathOnly.startsWith('/api/') || pathOnly.startsWith('/_nuxt/') || pathOnly.startsWith('/__')) return false

  const lastSegment = pathOnly.split('/').pop() ?? ''
  return !lastSegment.includes('.')
}

/** True when a signed-out visitor is asking for a page that needs a login. */
export function shouldRedirectToLogin(method: string, path: string, accept: string | undefined, signedIn: boolean): boolean {
  if (signedIn || !isPageNavigation(method, path, accept)) return false

  const pathOnly = (path.split('?')[0] ?? '').replace(/\/+$/, '') || '/'
  return !PUBLIC_PAGES.includes(pathOnly)
}
