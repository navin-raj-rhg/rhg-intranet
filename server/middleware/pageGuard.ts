// Runs after auth.ts (middleware run in file-name order). A signed-out visitor
// asking for a page is sent to the login page before the app is sent at all.
// API calls are never redirected - they answer 401 on their own.
export default defineEventHandler((event) => {
  if (shouldRedirectToLogin(event.method, event.path, getHeader(event, 'accept'), !!event.context.user)) {
    return sendRedirect(event, '/login', 302)
  }
})
