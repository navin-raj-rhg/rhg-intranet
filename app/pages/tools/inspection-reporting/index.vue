<script setup lang="ts">
import type { InspectionMyRoleResponse } from '~~/shared/types/inspection'

const authStore = useAuthStore()

const { data: role, pending, error } = await useAsyncData('inspection-reporting-my-role', () =>
  useApiFetch<InspectionMyRoleResponse>('/api/tools/inspection-reporting/my-role')
)

type TabValue = 'reports' | 'templates' | 'locations'

// Admins also get Templates and Suppliers & DCs. ?tab= opens straight on one
// (the template builder returns to ?tab=templates).
const tabItems = computed<{ label: string, value: TabValue }[]>(() => [
  { label: 'Reports', value: 'reports' },
  ...(role.value?.isAdmin
    ? [
        { label: 'Templates', value: 'templates' as const },
        { label: 'Suppliers & DCs', value: 'locations' as const }
      ]
    : [])
])

const route = useRoute()
const wanted = route.query.tab
const tab = ref<TabValue>(wanted === 'templates' || wanted === 'locations' ? wanted : 'reports')
const shownTab = computed<TabValue>(() => (tabItems.value.some(t => t.value === tab.value) ? tab.value : 'reports'))
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
      title="Inspection Reporting"
      description="Product QC inspections at suppliers and DCs: checklists, photos and non-conformances, reviewed and closed by a reviewer."
    >
      <template
        v-if="authStore.profile?.isOwner || role?.canCreate"
        #links
      >
        <UButton
          v-if="role?.canCreate"
          to="/tools/inspection-reporting/new"
          icon="i-lucide-plus"
          label="New inspection"
        />
        <UButton
          v-if="authStore.profile?.isOwner"
          to="/tools/inspection-reporting/access"
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
      description="You may not have access to Inspection Reporting yet - ask the workspace owner to assign you a role."
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
        v-show="shownTab === 'reports'"
        class="mt-6"
      >
        <InspectionReportingReportList />
      </div>
      <div
        v-if="role?.isAdmin"
        v-show="shownTab === 'templates'"
        class="mt-6"
      >
        <InspectionReportingTemplatesAdmin />
      </div>
      <div
        v-if="role?.isAdmin"
        v-show="shownTab === 'locations'"
        class="mt-6"
      >
        <InspectionReportingLocationsAdmin />
      </div>
    </template>
  </UContainer>
</template>
