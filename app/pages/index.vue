<script setup lang="ts">
// Placeholder dashboard - Step 6 will build the real widgets + tool launcher
const authStore = useAuthStore()
const toast = useToast()

const { data: ownerStatus, refresh: refreshOwnerStatus } = await useFetch('/api/auth/owner-status')
const claimingOwner = ref(false)

async function claimOwner() {
  claimingOwner.value = true
  try {
    await useApiFetch('/api/auth/claim-owner', { method: 'POST' })
    await authStore.fetchProfile()
    await refreshOwnerStatus()
    toast.add({ title: 'You are now the workspace owner', color: 'success' })
  } catch (err) {
    toast.add({
      title: 'Could not claim owner access',
      description: err instanceof Error ? err.message : 'Something went wrong.',
      color: 'error'
    })
  } finally {
    claimingOwner.value = false
  }
}
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Dashboard"
      description="Welcome to the RHG Intranet. This is a scaffold - the real dashboard widgets and tool launcher come in a later step."
    />

    <UAlert
      v-if="!ownerStatus?.ownerExists"
      class="mt-6"
      color="warning"
      variant="subtle"
      title="No workspace owner is set yet"
      description="The owner has full access across every tool. Claim it now if this is your account."
    >
      <template #actions>
        <UButton
          size="sm"
          :loading="claimingOwner"
          @click="claimOwner"
        >
          Claim owner access
        </UButton>
      </template>
    </UAlert>

    <UPageGrid class="mt-8">
      <UCard>
        <template #header>
          <span class="font-medium">Stack check</span>
        </template>
        <ul class="text-sm text-muted space-y-1">
          <li>Nuxt 4 + TypeScript ✅</li>
          <li>Nuxt UI 4 ✅</li>
          <li>Pinia ✅</li>
          <li>Drizzle ORM (Supabase Postgres) ✅</li>
          <li>Supabase Auth ✅</li>
          <li>Cloudflare R2 - configured in Step 5</li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <span class="font-medium">Your profile</span>
        </template>
        <dl
          v-if="authStore.profile"
          class="text-sm space-y-1"
        >
          <div class="flex justify-between">
            <dt class="text-muted">
              Name
            </dt>
            <dd>{{ authStore.profile.fullName || '—' }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted">
              Email
            </dt>
            <dd>{{ authStore.profile.email }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted">
              Role
            </dt>
            <dd>
              <UBadge :color="authStore.profile.isOwner ? 'primary' : 'neutral'">
                {{ authStore.profile.isOwner ? 'Owner' : 'Member' }}
              </UBadge>
            </dd>
          </div>
        </dl>
      </UCard>
    </UPageGrid>
  </UContainer>
</template>
