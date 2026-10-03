<script setup lang="ts">
const route = useRoute()
const productId = Number(route.params.id)

const { data: role, error } = await useAsyncData('pim-my-role', () =>
  useApiFetch<{ canEdit: boolean, isAdmin: boolean }>('/api/tools/pim/my-role')
)
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

    <UAlert
      v-if="error || !Number.isInteger(productId) || productId <= 0"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Couldn't open this page"
      description="You may not have access to Product Information yet - ask the workspace owner to assign you a role."
    />
    <div
      v-else-if="role"
      class="mt-6"
    >
      <PimProductPage
        :key="productId"
        :product-id="productId"
        :can-edit="role.canEdit"
        :is-admin="role.isAdmin"
      />
    </div>
  </UContainer>
</template>
