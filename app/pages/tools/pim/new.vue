<script setup lang="ts">
import type { PimCategoryItem } from '~~/shared/types/pim'

const toast = useToast()

const [roleReq, catsReq] = await Promise.all([
  useAsyncData('pim-my-role', () => useApiFetch<{ canEdit: boolean }>('/api/tools/pim/my-role')),
  useAsyncData('pim-categories', () => useApiFetch<PimCategoryItem[]>('/api/tools/pim/categories'))
])

const error = computed(() => roleReq.error.value || catsReq.error.value)
const saving = ref(false)

async function save(body: Record<string, unknown>) {
  saving.value = true
  try {
    const created = await useApiFetch<{ id: number }>('/api/tools/pim/products', { method: 'POST', body })
    toast.add({ title: 'Product added', color: 'success' })
    await navigateTo(`/tools/pim/products/${created.id}`)
  } catch (err) {
    toast.add({ title: 'Couldn\'t add the product', description: errorText(err), color: 'error' })
  } finally {
    saving.value = false
  }
}
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
    <UPageHeader title="New product" />

    <UAlert
      v-if="error"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Couldn't load this page"
      description="You may not have access to Product Information yet - ask the workspace owner to assign you a role."
    />
    <UAlert
      v-else-if="!roleReq.data.value?.canEdit"
      class="mt-6"
      color="warning"
      variant="subtle"
      title="Editor access needed"
      description="Only editors and admins can add products. Ask the workspace owner if you need this."
    />
    <div
      v-else
      class="mt-6"
    >
      <PimProductForm
        :categories="catsReq.data.value ?? []"
        :saving="saving"
        submit-label="Add product"
        @save="save"
        @cancel="navigateTo('/tools/pim')"
      />
    </div>
  </UContainer>
</template>
