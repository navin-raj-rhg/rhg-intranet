<script setup lang="ts">
const authStore = useAuthStore()

const { data: role, pending, error } = await useAsyncData('pim-my-role', () =>
  useApiFetch<{ roles: string[], canEdit: boolean, isAdmin: boolean }>('/api/tools/pim/my-role')
)

type TabValue = 'products' | 'setup'

// Admins also get the Categories & attributes setup. ?tab= opens straight on one.
const tabItems = computed<{ label: string, value: TabValue }[]>(() => [
  { label: 'Products', value: 'products' },
  ...(role.value?.isAdmin ? [{ label: 'Categories & attributes', value: 'setup' as const }] : [])
])

const route = useRoute()
const tab = ref<TabValue>(route.query.tab === 'setup' ? 'setup' : 'products')
const shownTab = computed<TabValue>(() => (tabItems.value.some(t => t.value === tab.value) ? tab.value : 'products'))
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="Back to the dashboard"
      class="-ml-2 mb-2"
    />

    <UPageHeader
      title="Product Information"
      description="One searchable catalogue of RHG products: details, suppliers, packaging, images and documents."
    >
      <template
        v-if="authStore.profile?.isOwner"
        #links
      >
        <UButton
          to="/tools/pim/access"
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
      description="You may not have access to Product Information yet - ask the workspace owner to assign you a role."
    />

    <div
      v-else-if="pending"
      class="mt-6 text-sm text-muted"
    >
      Loading…
    </div>

    <template v-else>
      <UTabs
        v-if="tabItems.length > 1"
        v-model="tab"
        class="mt-6"
        :items="tabItems"
        :content="false"
      />

      <!-- v-show, not v-if: switching tabs must not lose what's on the other tab. -->
      <div
        v-show="shownTab === 'products'"
        class="mt-6"
      >
        <PimProductList :can-edit="!!role?.canEdit" />
      </div>
      <div
        v-if="role?.isAdmin"
        v-show="shownTab === 'setup'"
        class="mt-6"
      >
        <PimCategoriesAdmin />
      </div>
    </template>
  </UContainer>
</template>
