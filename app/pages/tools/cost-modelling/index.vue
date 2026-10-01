<script setup lang="ts">
import type { CostMyRoleResponse } from '~~/shared/types/costModelling'

const authStore = useAuthStore()

const { data: myRole, pending, error } = await useAsyncData('cost-modelling-my-role', () =>
  useApiFetch<CostMyRoleResponse>('/api/tools/cost-modelling/my-role')
)

type TabValue = 'model' | 'factors' | 'setup'

// Setup (categories, ports, charge lines) is for admins and the owner only.
const isAdmin = computed(() => myRole.value?.isAdmin ?? false)

const tabItems = computed(() => {
  const items: { label: string, value: TabValue }[] = [
    { label: 'Cost Model', value: 'model' },
    { label: 'Factors', value: 'factors' }
  ]
  if (isAdmin.value) items.push({ label: 'Setup', value: 'setup' })
  return items
})

// ?tab=factors (or setup, for admins) opens straight on that tab.
const route = useRoute()
const tab = ref<TabValue>(
  route.query.tab === 'factors'
    ? 'factors'
    : route.query.tab === 'setup' && isAdmin.value ? 'setup' : 'model'
)
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Cost Modelling"
      description="Cost products from FOB price to landed cost in AUD, with container fill, shipping per unit and margins."
    >
      <template
        v-if="authStore.profile?.isOwner"
        #links
      >
        <UButton
          to="/tools/cost-modelling/access"
          icon="i-lucide-users"
          variant="outline"
          label="Manage access"
        />
      </template>
    </UPageHeader>

    <UAlert
      v-if="error"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Couldn't load this tool"
      description="You may not have access to Cost Modelling yet - ask the workspace owner to assign you a role."
    />

    <div
      v-else-if="pending"
      class="mt-6 text-sm text-muted"
    >
      Loading…
    </div>

    <template v-else>
      <UTabs
        v-model="tab"
        class="mt-6"
        :items="tabItems"
        :content="false"
      />

      <!-- v-show, not v-if: switching tabs must not lose what's on the other tab. -->
      <CostModellingModelsTab v-show="tab === 'model'" />
      <CostModellingFactorsView v-show="tab === 'factors'" />
      <CostModellingSetupView v-if="isAdmin && tab === 'setup'" />
    </template>
  </UContainer>
</template>
