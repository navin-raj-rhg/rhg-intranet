<script setup lang="ts">
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

// A person deactivated while the app is open (or whose profile arrives just after
// sign-in) is moved to the "deactivated" page.
const authStore = useAuthStore()
watch(() => authStore.profile?.deactivatedAt, (deactivatedAt) => {
  if (deactivatedAt && useRoute().path !== '/deactivated') navigateTo('/deactivated')
})

useSeoMeta({
  title: 'RHG Intranet',
  description: 'RHG internal portal - dashboard and company tools'
})
</script>

<template>
  <UApp>
    <!-- Thin bar across the top while a page is opening, so a slow click never looks stuck -->
    <NuxtLoadingIndicator
      color="var(--rhg-loading-bar)"
      :height="4"
      :throttle="0"
    />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
