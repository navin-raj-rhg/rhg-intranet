<script setup lang="ts">
import type { CostModelDetail } from '~~/shared/types/costModelling'

/** One saved cost model, read-only (Step 11.8a). Duplicate / Delete come in 11.8c. */
const props = defineProps<{ modelId: number }>()
const emit = defineEmits<{ back: [], open: [id: number] }>()

const { data: model, pending, error } = await useAsyncData(
  `cost-model-${props.modelId}`,
  () => useApiFetch<CostModelDetail>(`/api/tools/cost-modelling/models/${props.modelId}`)
)

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
      <div>
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
