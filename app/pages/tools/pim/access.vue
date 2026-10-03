<script setup lang="ts">
const authStore = useAuthStore()
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/tools/pim"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="Back to Product Information"
      class="-ml-2 mb-2"
    />

    <UPageHeader
      title="Product Information - Manage access"
      description="Tick Viewer for people who look products up and download files, Editor for those who also add and change products, and Admin for the few who also set up categories and attributes and can delete products. Everyone with a role sees every product."
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
      tool-id="pim"
    />
  </UContainer>
</template>
