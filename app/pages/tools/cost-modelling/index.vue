<script setup lang="ts">
import type { CostMyRoleResponse } from '~~/shared/types/costModelling'

const { pending, error } = await useAsyncData('cost-modelling-my-role', () =>
  useApiFetch<CostMyRoleResponse>('/api/tools/cost-modelling/my-role')
)

type TabValue = 'model' | 'factors'

const tabItems: { label: string, value: TabValue }[] = [
  { label: 'Cost Model', value: 'model' },
  { label: 'Factors', value: 'factors' }
]

// ?tab=factors opens straight on the Factors tab.
const route = useRoute()
const tab = ref<TabValue>(route.query.tab === 'factors' ? 'factors' : 'model')
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Cost Modelling"
      description="Cost products from FOB price to landed cost in AUD, with container fill, shipping per unit and margins."
    />

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

      <UAlert
        v-if="tab === 'model'"
        class="mt-8"
        color="neutral"
        variant="subtle"
        icon="i-lucide-hammer"
        title="Cost Model tab coming next"
        description="Creating, saving and searching cost models is built in Steps 11.6 to 11.8."
      />
      <!-- v-show, not v-if: switching tabs must not throw away unsaved Factors edits. -->
      <CostModellingFactorsView v-show="tab === 'factors'" />
    </template>
  </UContainer>
</template>
