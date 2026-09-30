<script setup lang="ts">
import type { CostModelDetail } from '~~/shared/types/costModelling'

/** One saved cost model, read-only (Step 11.8a), with Duplicate and admin Delete (11.8c). */
const props = defineProps<{ modelId: number }>()
const emit = defineEmits<{ back: [], open: [id: number], duplicate: [id: number], deleted: [] }>()

const toast = useToast()

const { data: model, pending, error } = await useAsyncData(
  `cost-model-${props.modelId}`,
  () => useApiFetch<CostModelDetail>(`/api/tools/cost-modelling/models/${props.modelId}`)
)

/* --- Delete (admins and the owner; the API checks too) --- */
const confirmOpen = ref(false)
const deleting = ref(false)

async function deleteModel() {
  if (!model.value) return
  deleting.value = true
  try {
    await useApiFetch(`/api/tools/cost-modelling/models/${model.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Cost model deleted', description: model.value.name, color: 'success' })
    confirmOpen.value = false
    await refreshNuxtData('cost-models-list')
    emit('deleted')
  } catch (err) {
    toast.add({ title: 'Could not delete', description: errorText(err), color: 'error' })
  } finally {
    deleting.value = false
  }
}

const ports = computed(() => model.value?.factorsSnapshot.destinations.map(d => d.port) ?? [])

const savedText = computed(() => {
  if (!model.value) return ''
  const at = new Date(model.value.createdAt)
  const time = at.toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' })
  return `Saved by ${model.value.createdByName} on ${formatDateMY(todayMY(at))} at ${time}`
})
</script>

<template>
  <div class="space-y-6">
    <UButton
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="All cost models"
      class="-ml-2"
      @click="emit('back')"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't open this cost model"
      :description="errorText(error)"
    />

    <p
      v-else-if="pending"
      class="text-sm text-muted"
    >
      Loading…
    </p>

    <template v-else-if="model">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="text-xl font-semibold text-highlighted">
            {{ model.name }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ savedText }}
            <template v-if="model.duplicatedFrom">
              · copied from
              <ULink
                class="text-primary hover:underline"
                @click="emit('open', model.duplicatedFrom.id)"
              >
                {{ model.duplicatedFrom.name }}
              </ULink>
            </template>
          </p>
        </div>
        <div class="flex gap-2">
          <UButton
            icon="i-lucide-copy"
            label="Duplicate"
            color="neutral"
            variant="outline"
            @click="emit('duplicate', model.id)"
          />
          <UButton
            v-if="model.canDelete"
            icon="i-lucide-trash-2"
            label="Delete"
            color="error"
            variant="outline"
            @click="confirmOpen = true"
          />
        </div>
      </div>

      <UModal
        v-model:open="confirmOpen"
        title="Delete this cost model?"
        :description="model.name"
      >
        <template #body>
          <p class="text-sm">
            This permanently deletes the model and its {{ model.rows.length }} product{{ model.rows.length === 1 ? '' : 's' }}.
            Copies made from it are kept. This can't be undone.
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
              label="Delete cost model"
              color="error"
              icon="i-lucide-trash-2"
              :loading="deleting"
              @click="deleteModel"
            />
          </div>
        </template>
      </UModal>

      <div class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <p class="text-muted">
            Supplier
          </p>
          <p class="font-medium">
            {{ model.supplierName }}
          </p>
        </div>
        <div>
          <p class="text-muted">
            Category
          </p>
          <p class="font-medium">
            {{ model.categoryName }}
          </p>
        </div>
        <div>
          <p class="text-muted">
            Sub-category
          </p>
          <p class="font-medium">
            {{ model.subCategoryName || '—' }}
          </p>
        </div>
        <div>
          <p class="text-muted">
            Ship from
          </p>
          <p class="font-medium">
            {{ model.factorsSnapshot.originPort.name }}
          </p>
        </div>
        <div>
          <p class="text-muted">
            Landed cost basis
          </p>
          <p class="font-medium">
            {{ CONTAINER_LABELS[model.containerBasis] }} container
          </p>
        </div>
      </div>

      <p
        v-if="model.notes"
        class="rounded-md bg-elevated/60 p-3 text-sm whitespace-pre-line"
      >
        {{ model.notes }}
      </p>

      <CostModellingFactorsSnapshot :snapshot="model.factorsSnapshot" />

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="font-medium">Products ({{ model.rows.length }})</span>
            <span class="text-xs text-muted">
              Figures as saved - they don't change when Factors do. Margins use the highlighted (most expensive) port.
            </span>
          </div>
        </template>
        <CostModellingProductResultsTable
          :rows="model.rows"
          :ports="ports"
          :basis="model.containerBasis"
        />
      </UCard>
    </template>
  </div>
</template>
