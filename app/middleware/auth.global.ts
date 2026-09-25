// Client-only guard for this scaffold: session lives in browser storage
// (via Supabase's client-side auth), so there is nothing to check on the
// server render pass. Real data protection happens server-side in
// server/middleware/auth.ts, which validates the bearer token on every
// /api/* call regardless of what the page itself shows.
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const authStore = useAuthStore()
  const publicPages = ['/login']

  if (!authStore.user && !publicPages.includes(to.path)) {
    return navigateTo('/login')
  }

  if (authStore.user && to.path === '/login') {
    return navigateTo('/')
  }
})
