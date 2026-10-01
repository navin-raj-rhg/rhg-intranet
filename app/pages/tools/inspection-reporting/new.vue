<script setup lang="ts">
import type { InspectionMyRoleResponse } from '~~/shared/types/inspection'

const { data: role, error } = await useAsyncData('inspection-reporting-my-role', () =>
  useApiFetch<InspectionMyRoleResponse>('/api/tools/inspection-reporting/my-role')
)
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/tools/inspection-reporting"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="Back to Inspection Reporting"
      class="-ml-2 mb-2"
    />
    <UPageHeader
      title="New inspection"
      description="Choose where the inspection is and which template to use. You'll fill in the checklist next."
    />

    <UAlert
      v-if="error"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Couldn't load this tool"
      description="You may not have access to Inspection Reporting yet - ask the workspace owner to assign you a role."
    />
    <div
      v-else-if="role"
      class="mt-6"
    >
      <InspectionReportingNewReportForm :role="role" />
    </div>
  </UContainer>
</template>
