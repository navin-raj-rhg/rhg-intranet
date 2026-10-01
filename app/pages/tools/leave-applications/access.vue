<script setup lang="ts">
const authStore = useAuthStore()
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/tools/leave-applications"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="Back to Leave Applications"
      class="-ml-2 mb-2"
    />

    <UPageHeader
      title="Leave Applications - Manage access"
      description="Choose who can apply for leave (Employee) and who can approve it (Manager). Everyone who applies, you included, needs at least one manager, and nobody can approve their own leave."
    />

    <UAlert
      v-if="!authStore.profile?.isOwner"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Owner access required"
      description="Only the workspace owner can manage who has access to this tool."
    />

    <template v-else>
      <ToolAccessAdmin tool-id="leave-applications" />
      <LeaveApplicationsHolidays />
      <LeaveApplicationsProfileDates />
    </template>
  </UContainer>
</template>
