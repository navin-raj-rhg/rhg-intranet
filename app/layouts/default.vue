<script setup lang="ts">
const authStore = useAuthStore()
const toast = useToast()

async function handleSignOut() {
  await authStore.signOut()
  await navigateTo('/login')
}

const passwordOpen = ref(false)
const passwordSaving = ref(false)
const passwordForm = reactive({ password: '', confirm: '' })

function openPasswordDialog() {
  passwordForm.password = ''
  passwordForm.confirm = ''
  passwordOpen.value = true
}

async function savePassword() {
  const problem = newPasswordProblem(passwordForm.password, passwordForm.confirm)
  if (problem) {
    toast.add({ title: 'Password not changed', description: problem, color: 'error' })
    return
  }
  passwordSaving.value = true
  try {
    await authStore.changePassword(passwordForm.password)
    passwordOpen.value = false
    toast.add({ title: 'Password changed', description: 'Use the new password next time you sign in.', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Password not changed', description: errorText(err), color: 'error' })
  } finally {
    passwordSaving.value = false
  }
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
            { label: 'Change password', icon: 'i-lucide-key-round', onSelect: openPasswordDialog },
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

    <UModal
      v-model:open="passwordOpen"
      title="Change password"
      description="Choose a new password for your account."
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="savePassword"
        >
          <UFormField label="New password">
            <UInput
              v-model="passwordForm.password"
              type="password"
              name="new-password"
              autocomplete="new-password"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Confirm new password">
            <UInput
              v-model="passwordForm.confirm"
              type="password"
              name="confirm-password"
              autocomplete="new-password"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="passwordOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              :loading="passwordSaving"
            >
              Change password
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

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
