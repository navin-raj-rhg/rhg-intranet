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

useSeoMeta({
  title: 'RHG Intranet',
  description: 'RHG internal portal - dashboard and company tools'
})
</script>

<template>
  <UApp>
    <!-- Thin bar across the top while a page is opening, so a slow click never looks stuck -->
    <NuxtLoadingIndicator
      color="var(--ui-primary)"
      :height="4"
      :throttle="0"
    />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
