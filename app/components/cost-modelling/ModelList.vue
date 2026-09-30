<script setup lang="ts">
import type { CostModelListResponse } from '~~/shared/types/costModelling'

/** Saved cost models, newest first, with search and paging (Step 11.8a). */
const emit = defineEmits<{ open: [id: number] }>()

const search = ref('')
const query = ref('') // what was actually searched (debounced)
const page = ref(1)

let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    query.value = value.trim()
    page.value = 1
  }, 300)
})
onBeforeUnmount(() => clearTimeout(timer))

const { data, pending, error } = await useAsyncData(
  'cost-models-list',
  () => useApiFetch<CostModelListResponse>('/api/tools/cost-modelling/models', {
    query: { q: query.value || undefined, page: page.value }
  }),
  { watch: [query, page] }
)

const savedOn = (iso: string) => formatDateMY(todayMY(new Date(iso)))
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search supplier, category, product no. or description"
        class="w-full sm:w-96"
        aria-label="Search cost models"
      />
      <UTooltip text="Creating a new model is added in Step 11.8b">
        <UButton
          icon="i-lucide-plus"
          label="New cost model"
          disabled
        />
      </UTooltip>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load cost models"
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
        <template v-if="query">
          No cost models match "{{ query }}".
        </template>
        <template v-else>
          No cost models have been saved yet.
        </template>
      </p>

      <div
        v-else
        class="overflow-x-auto"
      >
        <table
          class="w-full text-sm"
          data-testid="model-list"
        >
          <thead>
            <tr class="text-left text-muted">
              <th class="px-4 py-3 font-medium">
                Cost model
              </th>
              <th class="hidden px-4 py-3 font-medium md:table-cell">
                Ship from
              </th>
              <th class="hidden px-4 py-3 text-right font-medium md:table-cell">
                Products
              </th>
              <th class="hidden px-4 py-3 font-medium lg:table-cell">
                Saved by
              </th>
              <th class="px-4 py-3 text-right font-medium">
                Date
              </th>
            </tr>
          </thead>
          <tbody :class="pending ? 'opacity-60' : ''">
            <tr
              v-for="m in data?.items"
              :key="m.id"
              class="cursor-pointer border-t border-default hover:bg-elevated/50"
              @click="emit('open', m.id)"
            >
              <td class="px-4 py-3">
                <NuxtLink
                  :to="{ query: { model: m.id } }"
                  class="font-medium text-highlighted hover:underline"
                  @click.prevent.stop="emit('open', m.id)"
                >
                  {{ m.supplierName }}
                </NuxtLink>
                <p class="text-xs text-muted">
                  {{ m.categoryName }}<template v-if="m.subCategoryName">
                    › {{ m.subCategoryName }}
                  </template>
                  <span class="md:hidden"> · {{ m.originCode }} · {{ m.rowCount }} products</span>
                </p>
              </td>
              <td class="hidden px-4 py-3 md:table-cell">
                {{ m.originCode }}
              </td>
              <td class="hidden px-4 py-3 text-right md:table-cell">
                {{ m.rowCount }}
              </td>
              <td class="hidden px-4 py-3 lg:table-cell">
                {{ m.createdByName }}
              </td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                {{ savedOn(m.createdAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <div
      v-if="data && data.total > data.pageSize"
      class="flex items-center justify-between gap-3"
    >
      <p class="text-sm text-muted">
        {{ data.total }} cost models
      </p>
      <UPagination
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>
  </div>
</template>
