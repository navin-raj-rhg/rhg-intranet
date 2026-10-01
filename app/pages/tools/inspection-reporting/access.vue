<script setup lang="ts">
const authStore = useAuthStore()
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
      title="Inspection Reporting - Manage access"
      description="Tick Inspector for people who carry out inspections, Reviewer for those who close or send back reports, and Admin for the few who build report templates, manage the supplier and DC list and delete reports. Everyone with a role can see every report."
    />

    <UAlert
      v-if="!authStore.profile?.isOwner"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Owner access required"
      description="Only the workspace owner can manage who has access to this tool."
    />

    <ToolAccessAdmin
      v-else
      tool-id="inspection-reporting"
    />
  </UContainer>
</template>
