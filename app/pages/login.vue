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
    toast.add({
      title: mode.value === 'signin' ? 'Sign in failed' : 'Sign up failed',
      description: err instanceof Error ? err.message : 'Something went wrong.',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-elevated/30">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-lg font-semibold">
          RHG Intranet
        </h1>
        <p class="text-sm text-muted">
          {{ mode === 'signin' ? 'Sign in to continue' : 'Create an account' }}
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
            placeholder="Jane Tan"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Email">
          <UInput
            v-model="form.email"
            type="email"
            placeholder="you@company.com"
            class="w-full"
            required
          />
        </UFormField>

        <UFormField label="Password">
          <UInput
            v-model="form.password"
            type="password"
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
        <UButton
          variant="link"
          size="sm"
          class="p-0"
          @click="mode = mode === 'signin' ? 'signup' : 'signin'"
        >
          {{ mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in' }}
        </UButton>
      </template>
    </UCard>
  </div>
</template>
