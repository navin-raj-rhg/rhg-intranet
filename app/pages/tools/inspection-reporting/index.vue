<script setup lang="ts">
import type { InspectionMyRoleResponse } from '~~/shared/types/inspection'

const authStore = useAuthStore()

const { pending, error } = await useAsyncData('inspection-reporting-my-role', () =>
  useApiFetch<InspectionMyRoleResponse>('/api/tools/inspection-reporting/my-role')
)
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Inspection Reporting"
      description="Product QC inspections at suppliers and DCs: checklists, photos and non-conformances, reviewed and closed by a reviewer."
    >
      <template
        v-if="authStore.profile?.isOwner"
        #links
      >
        <UButton
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

    <div
      v-else
      class="mt-6"
    >
      <InspectionReportingReportList />
    </div>
  </UContainer>
</template>
