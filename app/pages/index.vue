<script setup lang="ts">
// Placeholder dashboard - Step 6 will build the real widgets + tool launcher
const { data: apiCheck } = await useFetch('/api/dashboard/summary')
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Dashboard"
      description="Welcome to the RHG Intranet. This is a scaffold - the real dashboard widgets and tool launcher come in a later step."
    />

    <UPageGrid class="mt-8">
      <UCard>
        <template #header>
          <span class="font-medium">Stack check</span>
        </template>
        <ul class="text-sm text-muted space-y-1">
          <li>Nuxt 4 + TypeScript ✅</li>
          <li>Nuxt UI 4 ✅</li>
          <li>Pinia ✅</li>
          <li>Drizzle ORM (Supabase Postgres) - configured in Step 3</li>
          <li>Cloudflare R2 - configured in Step 5</li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <span class="font-medium">API round-trip</span>
        </template>
        <p class="text-sm text-muted">
          {{ apiCheck?.message ?? 'Loading...' }}
        </p>
      </UCard>
    </UPageGrid>
  </UContainer>
</template>
