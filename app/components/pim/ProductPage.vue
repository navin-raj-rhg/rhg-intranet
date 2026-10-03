<script setup lang="ts">
import type { PimCategoryItem, PimHistoryItem, PimProductView } from '~~/shared/types/pim'
import { PIM_STATUS_LABELS, type PimStatus } from '~~/shared/utils/pimRules'

/**
 * One product (Step 17.7): everything about it, with Edit (editors and admins),
 * Delete (admins), images and documents (17.8) and the change history.
 */

const props = defineProps<{ productId: number, canEdit: boolean, isAdmin: boolean }>()
const toast = useToast()

const { data: categories } = await useAsyncData('pim-categories', () =>
  useApiFetch<PimCategoryItem[]>('/api/tools/pim/categories')
)
const { data: product, error, refresh } = await useAsyncData(`pim-product-${props.productId}`, () =>
  useApiFetch<PimProductView>(`/api/tools/pim/products/${props.productId}`)
)
const { data: history, refresh: refreshHistory } = await useAsyncData(`pim-history-${props.productId}`, () =>
  useApiFetch<PimHistoryItem[]>(`/api/tools/pim/products/${props.productId}/history`)
)

const category = computed(() => categories.value?.find(c => c.id === product.value?.categoryId))
const subCategory = computed(() => category.value?.subCategories.find(s => s.id === product.value?.subCategoryId))
const attributeRows = computed(() =>
  (category.value?.attributes ?? [])
    .filter(a => product.value?.attributeValues[a.id])
    .map((a) => {
      const raw = product.value!.attributeValues[a.id]!
      return { id: a.id, name: a.name, value: a.type === 'yesno' ? (raw === 'yes' ? 'Yes' : 'No') : raw }
    })
)

const statusColor: Record<PimStatus, 'neutral' | 'success' | 'warning'> = { draft: 'neutral', active: 'success', discontinued: 'warning' }
const money = (v: string | null) => (v === null ? '' : `$${Number(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const LEVEL_LABELS = { carton: 'Carton', outer: 'Outer', pallet: 'Pallet' } as const

function sizeText(p: PimProductView['packaging'][number]): string {
  const parts = [p.lengthCm, p.widthCm, p.heightCm]
  return parts.some(v => v !== null) ? `${parts.map(v => (v === null ? '?' : Number(v))).join(' × ')} cm` : '—'
}

const reloadAll = () => Promise.all([refresh(), refreshHistory()])

/* --- Edit --- */

const editing = ref(false)
const saving = ref(false)

async function save(body: Record<string, unknown>) {
  saving.value = true
  try {
    await useApiFetch(`/api/tools/pim/products/${props.productId}`, { method: 'PUT', body })
    await reloadAll()
    editing.value = false
    toast.add({ title: 'Product saved', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Couldn\'t save the product', description: errorText(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

/* --- Delete (admins; the API checks too) --- */

const confirmOpen = ref(false)
const deleting = ref(false)

async function deleteProduct() {
  deleting.value = true
  try {
    await useApiFetch(`/api/tools/pim/products/${props.productId}`, { method: 'DELETE' })
    toast.add({ title: 'Product deleted', description: product.value?.name, color: 'success' })
    await navigateTo('/tools/pim')
  } catch (err) {
    toast.add({ title: 'Couldn\'t delete the product', description: errorText(err), color: 'error' })
    deleting.value = false
  }
}
</script>

<template>
  <UAlert
    v-if="error || !product"
    color="error"
    variant="subtle"
    title="Couldn't open this product"
    :description="error ? errorText(error) : 'It may have been deleted.'"
  />

  <div
    v-else
    class="space-y-6"
  >
    <!-- Header -->
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1">
        <h1 class="break-words text-2xl font-bold text-highlighted">
          {{ product.name }}
        </h1>
        <p class="break-words text-sm text-muted">
          {{ product.productNo }}
        </p>
      </div>
      <UBadge
        :color="statusColor[product.status]"
        variant="subtle"
        :label="PIM_STATUS_LABELS[product.status]"
      />
      <template v-if="!editing">
        <UButton
          v-if="canEdit"
          icon="i-lucide-pencil"
          label="Edit"
          data-testid="product-edit"
          @click="editing = true"
        />
        <UButton
          v-if="isAdmin"
          icon="i-lucide-trash-2"
          color="error"
          variant="outline"
          label="Delete"
          @click="confirmOpen = true"
        />
      </template>
    </div>

    <PimProductForm
      v-if="editing"
      :product="product"
      :categories="categories ?? []"
      :saving="saving"
      @save="save"
      @cancel="editing = false"
    />

    <template v-else>
      <!-- Completeness -->
      <UCard>
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-sm font-medium">
            {{ product.completeness.percent }}% complete
          </span>
          <span
            v-if="product.completeness.total"
            class="text-xs text-muted"
          >
            {{ product.completeness.filled }} of {{ product.completeness.total }} required fields filled
          </span>
          <span
            v-else
            class="text-xs text-muted"
          >
            No fields are marked as required for this product's category.
          </span>
        </div>
        <UProgress
          class="mt-2"
          :model-value="product.completeness.percent"
          :color="product.completeness.percent === 100 ? 'success' : 'warning'"
        />
        <p
          v-if="product.completeness.missing.length"
          class="mt-2 text-sm text-muted"
        >
          Missing: {{ product.completeness.missing.join(', ') }}
        </p>
      </UCard>

      <PimFilesSection
        :product-id="productId"
        :files="product.files"
        :can-edit="canEdit"
        @changed="reloadAll"
      />

      <!-- Details -->
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Details
          </h2>
        </template>
        <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-muted">
              Brand
            </dt>
            <dd>{{ product.brand || '—' }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              Barcode (GTIN)
            </dt>
            <dd>{{ product.barcode || '—' }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              Category
            </dt>
            <dd>
              {{ category?.name ?? '—' }}<template v-if="subCategory">
                › {{ subCategory.name }}
              </template>
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              RRP (AUD)
            </dt>
            <dd>{{ product.rrp !== null ? money(product.rrp) : '—' }}</dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-muted">
              Short description
            </dt>
            <dd class="whitespace-pre-line break-words">
              {{ product.shortDescription || '—' }}
            </dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-muted">
              Long description
            </dt>
            <dd class="whitespace-pre-line break-words">
              {{ product.longDescription || '—' }}
            </dd>
          </div>
        </dl>
      </UCard>

      <!-- Suppliers -->
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Suppliers
          </h2>
        </template>
        <p
          v-if="!product.suppliers.length"
          class="text-sm text-muted"
        >
          No supplier recorded.
        </p>
        <ul v-else>
          <li
            v-for="s in product.suppliers"
            :key="s.name"
            class="flex flex-wrap items-center gap-2 border-t border-default py-2 text-sm first:border-t-0"
          >
            <span class="break-words font-medium">{{ s.name }}</span>
            <span
              v-if="s.supplierCode"
              class="text-muted"
            >code {{ s.supplierCode }}</span>
            <UBadge
              v-if="s.isPrimary"
              color="primary"
              variant="subtle"
              label="Primary"
            />
          </li>
        </ul>
      </UCard>

      <!-- Packaging -->
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Packaging and logistics
          </h2>
        </template>
        <p
          v-if="!product.packaging.length"
          class="text-sm text-muted"
        >
          No packaging details recorded.
        </p>
        <div
          v-else
          class="overflow-x-auto"
        >
          <table class="w-full text-left text-sm">
            <thead class="text-muted">
              <tr>
                <th class="py-1 pr-4 font-normal">
                  Level
                </th>
                <th class="py-1 pr-4 font-normal">
                  Size (L × W × H)
                </th>
                <th class="py-1 pr-4 font-normal">
                  Weight
                </th>
                <th class="py-1 font-normal">
                  Qty inside
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in product.packaging"
                :key="p.level"
                class="border-t border-default"
              >
                <td class="py-2 pr-4 font-medium">
                  {{ LEVEL_LABELS[p.level] }}
                </td>
                <td class="py-2 pr-4 whitespace-nowrap">
                  {{ sizeText(p) }}
                </td>
                <td class="py-2 pr-4 whitespace-nowrap">
                  {{ p.weightKg !== null ? `${Number(p.weightKg)} kg` : '—' }}
                </td>
                <td class="py-2">
                  {{ p.qtyInside ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <!-- Attributes -->
      <UCard v-if="category">
        <template #header>
          <h2 class="font-semibold">
            {{ category.name }} attributes
          </h2>
        </template>
        <p
          v-if="!attributeRows.length"
          class="text-sm text-muted"
        >
          No attribute values filled in.
        </p>
        <dl
          v-else
          class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2"
        >
          <div
            v-for="a in attributeRows"
            :key="a.id"
          >
            <dt class="text-muted">
              {{ a.name }}
            </dt>
            <dd class="break-words">
              {{ a.value }}
            </dd>
          </div>
        </dl>
      </UCard>

      <!-- History -->
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Change history
          </h2>
        </template>
        <p
          v-if="!history?.length"
          class="text-sm text-muted"
        >
          Nothing recorded yet.
        </p>
        <ul
          v-else
          data-testid="pim-history"
        >
          <li
            v-for="h in history"
            :key="h.id"
            class="border-t border-default py-2 text-sm first:border-t-0"
          >
            <p class="text-xs text-muted">
              {{ formatDateTimeMY(new Date(h.createdAt)) }} · {{ h.changedByName ?? 'Unknown' }}
            </p>
            <p class="break-words">
              {{ h.summary }}
            </p>
          </li>
        </ul>
      </UCard>

      <p class="text-xs text-muted">
        Added {{ formatDateTimeMY(new Date(product.createdAt)) }}<template v-if="product.createdByName">
          by {{ product.createdByName }}
        </template>. Last changed {{ formatDateTimeMY(new Date(product.updatedAt)) }}<template v-if="product.updatedByName">
          by {{ product.updatedByName }}
        </template>.
      </p>
    </template>

    <UModal
      v-model:open="confirmOpen"
      title="Delete this product?"
      :description="product.name"
    >
      <template #body>
        <p class="text-sm">
          This permanently deletes the product, its history and its images and documents. This can't be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Keep it"
            color="neutral"
            variant="outline"
            :disabled="deleting"
            @click="confirmOpen = false"
          />
          <UButton
            label="Delete product"
            color="error"
            icon="i-lucide-trash-2"
            :loading="deleting"
            @click="deleteProduct"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
