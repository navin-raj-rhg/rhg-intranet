<script setup lang="ts">
const authStore = useAuthStore()
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/tools/expense-claims"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="Back to Expense Claims"
      class="-ml-2 mb-2"
    />

    <UPageHeader
      title="Expense Claims - Manage access"
      description="Choose who can submit claims (Employee) and who can approve them (Manager)."
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
      tool-id="expense-claims"
    />
  </UContainer>
</template>
