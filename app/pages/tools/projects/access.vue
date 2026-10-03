<script setup lang="ts">
const authStore = useAuthStore()
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/tools/projects"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="Back to Projects"
      class="-ml-2 mb-2"
    />

    <UPageHeader
      title="Projects - Manage access"
      description="Tick User for people who start projects and work on their tasks, and Admin for the few who build the project types and the master task list and see every project. Projects are private to their members."
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
      tool-id="projects"
    />
  </UContainer>
</template>
