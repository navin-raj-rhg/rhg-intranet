<script setup lang="ts">
import type { InspectionMyRoleResponse } from '~~/shared/types/inspection'

const { data: role, error } = await useAsyncData('inspection-reporting-my-role', () =>
  useApiFetch<InspectionMyRoleResponse>('/api/tools/inspection-reporting/my-role')
)
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/tools/inspection-reporting?tab=templates"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="Back to templates"
      class="-ml-2 mb-2"
    />
    <UPageHeader title="New report template" />

    <UAlert
      v-if="error || (role && !role.isAdmin)"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Admin access required"
      description="Only Inspection Reporting admins can build templates."
    />
    <div
      v-else-if="role"
      class="mt-6"
    >
      <InspectionReportingTemplateBuilder :template-id="null" />
    </div>
  </UContainer>
</template>
