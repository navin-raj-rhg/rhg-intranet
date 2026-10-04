<script setup lang="ts">
// Where the emailed "forgot password" link lands. The Supabase client reads the
// link's code and signs the person in; this page then lets them pick a new password.
definePageMeta({ layout: false })

const authStore = useAuthStore()
const toast = useToast()

// Supabase reports why a link failed in the address (?error_description=... or
// #error_description=...). Keep it so the page can say the real reason.
const linkProblem = ref('')
onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  linkProblem.value = params.get('error_description') || hash.get('error_description') || ''
})

const saving = ref(false)
const form = reactive({ password: '', confirm: '' })

async function submit() {
  const problem = newPasswordProblem(form.password, form.confirm)
  if (problem) {
    toast.add({ title: 'Password not changed', description: problem, color: 'error' })
    return
  }
  saving.value = true
  try {
    await authStore.changePassword(form.password)
    toast.add({ title: 'Password changed', description: 'You are now signed in.', color: 'success' })
    await navigateTo('/')
  } catch (err) {
    toast.add({ title: 'Password not changed', description: errorText(err), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#006B96] px-4 py-10">
    <img
      src="/rhg-logo.png"
      alt="RHG - Rapid Hardware Group"
      class="h-24 w-auto"
    >
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-lg font-semibold">
          Choose a new password
        </h1>
      </template>

      <form
        v-if="authStore.user"
        class="space-y-4"
        @submit.prevent="submit"
      >
        <UFormField label="New password">
          <UInput
            v-model="form.password"
            type="password"
            name="new-password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Confirm new password">
          <UInput
            v-model="form.confirm"
            type="password"
            name="confirm-password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="saving"
        >
          Change password
        </UButton>
      </form>

      <div
        v-else
        class="space-y-3"
      >
        <p class="text-sm text-muted">
          This link could not be used. Ask for a new one from the sign-in page.
        </p>
        <p
          v-if="linkProblem"
          class="text-sm text-error"
        >
          Reason given: {{ linkProblem }}
        </p>
        <UButton
          to="/login"
          block
        >
          Back to sign in
        </UButton>
      </div>
    </UCard>
  </div>
</template>
