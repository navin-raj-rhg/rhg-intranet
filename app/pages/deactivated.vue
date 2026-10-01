<script setup lang="ts">
const authStore = useAuthStore()

// Anyone who is not (or no longer) deactivated has no business here.
if (authStore.profile && !authStore.profile.deactivatedAt) {
  await navigateTo('/')
}

async function handleSignOut() {
  await authStore.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <UContainer class="py-16">
    <UCard class="mx-auto max-w-md">
      <template #header>
        <h1 class="text-lg font-semibold">
          Your account has been deactivated
        </h1>
      </template>
      <p class="text-sm text-muted">
        You can no longer use the RHG Intranet with this account. If you think this is a mistake,
        please contact the workspace owner.
      </p>
      <template #footer>
        <UButton
          label="Sign out"
          icon="i-lucide-log-out"
          variant="outline"
          @click="handleSignOut"
        />
      </template>
    </UCard>
  </UContainer>
</template>
