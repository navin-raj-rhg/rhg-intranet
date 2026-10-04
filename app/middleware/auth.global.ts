// Client-only page guard (the server-side page redirect arrives in 14.5).
// Real data protection happens server-side in server/middleware/auth.ts, which
// validates the login on every /api/* call regardless of what the page shows.
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const authStore = useAuthStore()
  const publicPages = ['/login', '/reset-password']

  if (!authStore.user && !publicPages.includes(to.path)) {
    return navigateTo('/login')
  }

  // Someone the owner has deactivated only ever sees the "deactivated" page.
  if (authStore.profile?.deactivatedAt && to.path !== '/deactivated') {
    return navigateTo('/deactivated')
  }

  if (authStore.user && to.path === '/login') {
    return navigateTo('/')
  }
})
