<script setup lang="ts">
const authStore = useAuthStore()

async function handleSignOut() {
  await authStore.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div>
    <UHeader
      data-rhg-header
      :toggle="false"
    >
      <template #left>
        <NuxtLink
          to="/"
          class="flex items-center gap-3 font-semibold text-highlighted"
          aria-label="RHG Intranet home"
        >
          <img
            src="/rhg-logo.png"
            alt="RHG - Rapid Hardware Group"
            class="h-10 w-auto"
          >
          <span class="hidden sm:inline">Intranet</span>
        </NuxtLink>
      </template>

      <template #right>
        <UColorModeButton />
        <UDropdownMenu
          v-if="authStore.profile"
          :items="[[
            { label: authStore.profile.email, type: 'label' },
            { label: authStore.profile.isOwner ? 'Owner' : 'Member', type: 'label' }
          ], [
            { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: handleSignOut }
          ]]"
        >
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-user"
            :label="authStore.profile.fullName || authStore.profile.email"
          />
        </UDropdownMenu>
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          RHG Intranet &copy; {{ new Date().getFullYear() }}
        </p>
      </template>
    </UFooter>
  </div>
</template>
