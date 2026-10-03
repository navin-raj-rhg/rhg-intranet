<script setup lang="ts">
import type { PimCategoryItem, PimListItem, PimListResponse } from '~~/shared/types/pim'
import { PIM_STATUSES, PIM_STATUS_LABELS, type PimStatus } from '~~/shared/utils/pimRules'

/**
 * The product catalogue (Step 17.6): search, filter by status / category, 50 per
 * page, with the main image, supplier and how complete each product is.
 */

defineProps<{ canEdit: boolean }>()

const ALL = 0
const importOpen = ref(false)
const search = ref('')
const q = ref('')
const status = ref<'all' | PimStatus>('all')
const categoryId = ref(ALL)
const subCategoryId = ref(ALL)
const page = ref(1)

// Search as the person types, but only ask the server once they pause.
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    q.value = v.trim()
  }, 300)
})
onBeforeUnmount(() => clearTimeout(timer))

const { data: categories } = await useAsyncData('pim-categories', () =>
  useApiFetch<PimCategoryItem[]>('/api/tools/pim/categories')
)

const statusItems = [
  { value: 'all', label: 'Any status' },
  ...PIM_STATUSES.map(s => ({ value: s, label: PIM_STATUS_LABELS[s] }))
]
const categoryItems = computed(() => [
  { value: ALL, label: 'Any category' },
  ...(categories.value ?? []).map(c => ({ value: c.id, label: c.active ? c.name : `${c.name} (switched off)` }))
])
const subCategoryItems = computed(() => [
  { value: ALL, label: 'Any sub-category' },
  ...(categories.value?.find(c => c.id === categoryId.value)?.subCategories ?? []).map(s => ({ value: s.id, label: s.name }))
])
watch(categoryId, () => {
  subCategoryId.value = ALL
})
watch([q, status, categoryId, subCategoryId], () => {
  page.value = 1
})

const filterQuery = computed(() => ({
  q: q.value || undefined,
  status: status.value === 'all' ? undefined : status.value,
  categoryId: categoryId.value || undefined,
  subCategoryId: subCategoryId.value || undefined
}))

const { data, pending, error, refresh } = await useAsyncData(
  'pim-products',
  () => useApiFetch<PimListResponse>('/api/tools/pim/products', { query: { ...filterQuery.value, page: page.value } }),
  { watch: [filterQuery, page] }
)

const exportHref = computed(() => {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filterQuery.value)) if (v !== undefined) params.set(k, String(v))
  const s = params.toString()
  return `/api/tools/pim/products/export${s ? `?${s}` : ''}`
})

const statusColor: Record<PimStatus, 'neutral' | 'success' | 'warning'> = { draft: 'neutral', active: 'success', discontinued: 'warning' }
const money = (v: string | null) => (v === null ? '' : `$${Number(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
function metaLine(p: PimListItem): string {
  const category = p.categoryName ? (p.subCategoryName ? `${p.categoryName} › ${p.subCategoryName}` : p.categoryName) : ''
  const supplier = p.primarySupplier ? (p.supplierCount > 1 ? `${p.primarySupplier} +${p.supplierCount - 1} more` : p.primarySupplier) : ''
  return [p.productNo, p.brand, category, supplier].filter(Boolean).join(' · ')
}
const filtered = computed(() => !!(q.value || status.value !== 'all' || categoryId.value))
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search product no., name, brand, barcode or supplier"
        class="w-full sm:w-96"
        aria-label="Search products"
        data-testid="pim-search"
      />
      <USelect
        v-model="status"
        :items="statusItems"
        class="w-full sm:w-40"
        aria-label="Filter by status"
      />
      <USelect
        v-model="categoryId"
        :items="categoryItems"
        class="w-full sm:w-48"
        aria-label="Filter by category"
      />
      <USelect
        v-if="categoryId !== ALL && subCategoryItems.length > 1"
        v-model="subCategoryId"
        :items="subCategoryItems"
        class="w-full sm:w-48"
        aria-label="Filter by sub-category"
      />
      <div class="flex flex-wrap gap-2 sm:ml-auto">
        <UButton
          v-if="canEdit"
          to="/tools/pim/new"
          icon="i-lucide-plus"
          label="New product"
          data-testid="pim-new"
        />
        <UButton
          v-if="canEdit"
          icon="i-lucide-file-up"
          variant="outline"
          color="neutral"
          label="Import CSV"
          data-testid="pim-import"
          @click="importOpen = true"
        />
        <UButton
          :href="exportHref"
          external
          icon="i-lucide-download"
          variant="outline"
          color="neutral"
          label="Export CSV"
        />
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load products"
      :description="errorText(error)"
    />

    <UCard
      v-else
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <p
        v-if="!data?.items.length && !pending"
        class="p-6 text-sm text-muted"
      >
        <template v-if="filtered">
          No products match. Try clearing the search or filters.
        </template>
        <template v-else>
          No products yet.<template v-if="canEdit">
            Use "New product" to add the first one.
          </template>
        </template>
      </p>

      <ul
        v-else
        :class="pending ? 'opacity-60' : ''"
        data-testid="pim-list"
      >
        <li
          v-for="p in data?.items"
          :key="p.id"
          class="flex items-center gap-4 border-t border-default px-4 py-3 first:border-t-0"
          :data-testid="`product-row-${p.id}`"
        >
          <div class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-elevated">
            <img
              v-if="p.mainImageUrl"
              :src="p.mainImageUrl"
              :alt="p.name"
              class="size-full object-cover"
              loading="lazy"
            >
            <UIcon
              v-else
              name="i-lucide-image"
              class="size-6 text-muted"
            />
          </div>

          <div class="min-w-0 flex-1">
            <NuxtLink
              :to="`/tools/pim/products/${p.id}`"
              class="break-words font-medium text-highlighted hover:underline"
            >
              {{ p.name }}
            </NuxtLink>
            <p class="break-words text-xs text-muted">
              {{ metaLine(p) }}
            </p>
          </div>

          <div class="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span
              v-if="p.rrp !== null"
              class="text-sm text-muted"
            >{{ money(p.rrp) }}</span>
            <UBadge
              :color="p.completenessPercent === 100 ? 'success' : 'warning'"
              variant="subtle"
              :label="`${p.completenessPercent}% complete`"
            />
            <UBadge
              :color="statusColor[p.status]"
              variant="subtle"
              :label="PIM_STATUS_LABELS[p.status]"
            />
          </div>
        </li>
      </ul>
    </UCard>

    <div
      v-if="data && data.total > data.pageSize"
      class="flex justify-center"
    >
      <UPagination
        v-model:page="page"
        :items-per-page="data.pageSize"
        :total="data.total"
      />
    </div>
    <p
      v-if="data?.total"
      class="text-center text-xs text-muted"
    >
      {{ data.total }} product{{ data.total === 1 ? '' : 's' }}
    </p>

    <PimImportDialog
      v-if="canEdit"
      v-model:open="importOpen"
      @imported="refresh"
    />
  </div>
</template>
