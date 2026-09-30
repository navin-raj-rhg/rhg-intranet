<script setup lang="ts">
const authStore = useAuthStore()
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/tools/cost-modelling"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="Back to Cost Modelling"
      class="-ml-2 mb-2"
    />

    <UPageHeader
      title="Cost Modelling - Manage access"
      description="Tick User for everyone who should use Cost Modelling (create, view and duplicate cost models; view Factors). Also tick Admin for the few who can change Factors and delete cost models."
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
      tool-id="cost-modelling"
    />
  </UContainer>
</template>
