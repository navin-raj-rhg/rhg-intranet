<script setup lang="ts">
const authStore = useAuthStore()
const toast = useToast()

const { data: ownerStatus, refresh: refreshOwnerStatus } = await useFetch('/api/auth/owner-status')
const { data: tools } = await useTools()
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
      description="Welcome to the RHG Intranet."
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

    <!-- Widgets: at-a-glance info, placeholder data until real sources exist -->
    <UPageGrid class="mt-8">
      <UCard>
        <template #header>
          <span class="font-medium">Announcements</span>
        </template>
        <p class="text-sm text-muted">
          Placeholder: company announcements will appear here.
        </p>
      </UCard>

      <UCard>
        <template #header>
          <span class="font-medium">Sales overview</span>
        </template>
        <p class="text-sm text-muted">
          Placeholder: sales snapshot / chart will appear here.
        </p>
      </UCard>

      <UCard>
        <template #header>
          <span class="font-medium">Upcoming events</span>
        </template>
        <p class="text-sm text-muted">
          Placeholder: upcoming events will appear here.
        </p>
      </UCard>
    </UPageGrid>

    <!-- Launcher: tools the current user can access -->
    <div class="mt-10">
      <h2 class="text-lg font-semibold mb-4">
        Tools
      </h2>

      <UPageGrid v-if="tools && tools.length > 0">
        <UButton
          v-for="tool in tools"
          :key="tool.id"
          :to="tool.route"
          variant="outline"
          color="neutral"
          class="h-auto p-4 justify-start"
        >
          <div class="flex items-center gap-3">
            <UIcon
              :name="tool.icon || 'i-lucide-puzzle'"
              class="size-6 shrink-0"
            />
            <div class="text-left">
              <p class="font-medium">
                {{ tool.name }}
              </p>
              <p
                v-if="tool.description"
                class="text-xs text-muted"
              >
                {{ tool.description }}
              </p>
            </div>
          </div>
        </UButton>
      </UPageGrid>

      <UCard v-else>
        <p class="text-sm text-muted">
          No tools assigned to you yet. Ask the workspace owner to grant you access.
        </p>
      </UCard>
    </div>
  </UContainer>
</template>