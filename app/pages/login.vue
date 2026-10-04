<script setup lang="ts">
definePageMeta({ layout: false })

const authStore = useAuthStore()
const toast = useToast()

const mode = ref<'signin' | 'signup'>('signin')
const loading = ref(false)

const form = reactive({
  fullName: '',
  email: '',
  password: ''
})

const resetting = ref(false)

async function forgotPassword() {
  if (!form.email.trim()) {
    toast.add({ title: 'Enter your email first', description: 'Type your email address above, then click "Forgot password?".', color: 'warning' })
    return
  }
  resetting.value = true
  try {
    await authStore.sendPasswordReset(form.email.trim())
    // Same message whether or not the address has an account.
    toast.add({
      title: 'Check your email',
      description: 'If that address has an account, we sent a link to choose a new password.',
      color: 'success'
    })
  } catch (err) {
    toast.add({ title: 'Could not send the email', description: errorText(err), color: 'error' })
  } finally {
    resetting.value = false
  }
}

async function submit() {
  loading.value = true
  try {
    if (mode.value === 'signin') {
      await authStore.signIn(form.email, form.password)
      await navigateTo('/')
    } else {
      await authStore.signUp(form.email, form.password, form.fullName)
      toast.add({
        title: 'Check your email',
        description: 'We sent a confirmation link to finish creating your account.',
        color: 'success'
      })
      mode.value = 'signin'
    }
  } catch (err) {
    // The database refuses addresses that aren't on the allowed list, but
    // Supabase reports that only as a generic "Database error saving new user".
    const raw = err instanceof Error ? err.message : ''
    const refused = mode.value === 'signup' && /database error/i.test(raw)
    toast.add({
      title: mode.value === 'signin' ? 'Sign in failed' : 'Sign up failed',
      description: refused ? signupNotAllowedMessage() : raw || 'Something went wrong.',
      color: 'error'
    })
  } finally {
    loading.value = false
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
          RHG Intranet
        </h1>
        <p class="text-sm text-muted">
          {{ mode === 'signin' ? 'Sign in to continue' : 'Create an account with your RHG email address' }}
        </p>
      </template>

      <form
        class="space-y-4"
        @submit.prevent="submit"
      >
        <UFormField
          v-if="mode === 'signup'"
          label="Full name"
        >
          <UInput
            v-model="form.fullName"
            name="name"
            autocomplete="name"
            placeholder="Jane Tan"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Email">
          <UInput
            v-model="form.email"
            type="email"
            name="email"
            autocomplete="username"
            placeholder="you@company.com"
            class="w-full"
            required
          />
        </UFormField>

        <UFormField label="Password">
          <UInput
            v-model="form.password"
            type="password"
            name="password"
            :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
            placeholder="••••••••"
            class="w-full"
            required
          />
        </UFormField>

        <UButton
          type="submit"
          block
          :loading="loading"
        >
          {{ mode === 'signin' ? 'Sign in' : 'Sign up' }}
        </UButton>
      </form>

      <template #footer>
        <div class="flex flex-col items-start gap-1">
          <UButton
            variant="link"
            size="sm"
            class="p-0"
            @click="mode = mode === 'signin' ? 'signup' : 'signin'"
          >
            {{ mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in' }}
          </UButton>
          <UButton
            v-if="mode === 'signin'"
            variant="link"
            size="sm"
            class="p-0"
            :loading="resetting"
            @click="forgotPassword"
          >
            Forgot password?
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
