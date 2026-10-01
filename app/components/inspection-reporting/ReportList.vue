<script setup lang="ts">
import type { InspectionListResponse } from '~~/shared/types/inspection'
import { INSPECTION_OVERALL_LABELS, INSPECTION_STATUS_LABELS, type InspectionOverall, type InspectionStatus } from '~~/shared/utils/inspectionRules'

/** Inspection reports, newest first, with search, a status filter and paging (Step 12.6). */

const search = ref('')
const query = ref('') // what was actually searched (debounced)
const status = ref<'all' | InspectionStatus>('all')
const page = ref(1)

let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    query.value = value.trim()
    page.value = 1
  }, 300)
})
watch(status, () => {
  page.value = 1
})
onBeforeUnmount(() => clearTimeout(timer))

const statusItems = [
  { label: 'All statuses', value: 'all' },
  { label: INSPECTION_STATUS_LABELS.draft, value: 'draft' },
  { label: INSPECTION_STATUS_LABELS.in_review, value: 'in_review' },
  { label: INSPECTION_STATUS_LABELS.closed, value: 'closed' }
]

const { data, pending, error } = await useAsyncData(
  'inspection-reports-list',
  () => useApiFetch<InspectionListResponse>('/api/tools/inspection-reporting/reports', {
    query: {
      q: query.value || undefined,
      status: status.value === 'all' ? undefined : status.value,
      page: page.value
    }
  }),
  { watch: [query, status, page] }
)

const statusColor: Record<InspectionStatus, 'neutral' | 'warning' | 'success'> = {
  draft: 'neutral',
  in_review: 'warning',
  closed: 'success'
}

const overallColor: Record<InspectionOverall, 'success' | 'warning' | 'error'> = {
  pass: 'success',
  pass_with_conditions: 'warning',
  fail: 'error'
}

const filtered = computed(() => query.value !== '' || status.value !== 'all')
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search supplier / DC, product no., reference or report number"
        class="w-full sm:w-96"
        aria-label="Search inspection reports"
      />
      <USelect
        v-model="status"
        :items="statusItems"
        class="w-full sm:w-44"
        aria-label="Filter by status"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load inspection reports"
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
          No inspection reports match what you searched for.
        </template>
        <template v-else>
          No inspection reports have been started yet.
        </template>
      </p>

      <div
        v-else
        class="overflow-x-auto"
      >
        <table
          class="w-full text-sm"
          data-testid="inspection-list"
        >
          <thead>
            <tr class="text-left text-muted">
              <th class="px-4 py-3 font-medium">
                Report
              </th>
              <th class="hidden px-4 py-3 font-medium md:table-cell">
                Product / reference
              </th>
              <th class="hidden px-4 py-3 font-medium lg:table-cell">
                Inspector
              </th>
              <th class="px-4 py-3 font-medium">
                Status
              </th>
              <th class="hidden px-4 py-3 font-medium sm:table-cell">
                Result
              </th>
              <th class="hidden px-4 py-3 text-right font-medium sm:table-cell">
                Date
              </th>
            </tr>
          </thead>
          <tbody :class="pending ? 'opacity-60' : ''">
            <tr
              v-for="r in data?.items"
              :key="r.id"
              class="border-t border-default hover:bg-elevated/50"
              :data-testid="`inspection-row-${r.id}`"
            >
              <td class="px-4 py-3">
                <NuxtLink
                  :to="`/tools/inspection-reporting/${r.id}`"
                  class="font-medium text-highlighted hover:underline"
                >
                  {{ r.locationName }}
                </NuxtLink>
                <p class="text-xs text-muted">
                  #{{ r.id }} · {{ r.locationType === 'dc' ? 'DC' : 'Supplier' }} · {{ r.templateName }}
                  <span class="md:hidden">
                    <template v-if="r.productNo"> · {{ r.productNo }}</template>
                  </span>
                  <span class="sm:hidden"> · {{ formatDateMY(r.inspectionDate) }}</span>
                </p>
              </td>
              <td class="hidden px-4 py-3 md:table-cell">
                <template v-if="r.productNo || r.reference">
                  {{ r.productNo }}
                  <span
                    v-if="r.productNo && r.reference"
                    class="text-dimmed"
                  > · </span>
                  {{ r.reference }}
                </template>
                <span
                  v-else
                  class="text-dimmed"
                >-</span>
              </td>
              <td class="hidden px-4 py-3 lg:table-cell">
                {{ r.createdByName }}
              </td>
              <td class="px-4 py-3">
                <UBadge
                  :color="statusColor[r.status]"
                  variant="subtle"
                  :label="INSPECTION_STATUS_LABELS[r.status]"
                />
                <!-- The Result column is hidden on phones, so show it here instead. -->
                <div
                  v-if="r.status !== 'draft' && r.overall"
                  class="mt-1 sm:hidden"
                >
                  <UBadge
                    :color="overallColor[r.overall]"
                    variant="subtle"
                    :label="INSPECTION_OVERALL_LABELS[r.overall]"
                  />
                </div>
              </td>
              <td class="hidden px-4 py-3 sm:table-cell">
                <template v-if="r.status === 'draft'">
                  <span class="text-dimmed">-</span>
                </template>
                <template v-else-if="r.overall">
                  <UBadge
                    :color="overallColor[r.overall]"
                    variant="subtle"
                    :label="INSPECTION_OVERALL_LABELS[r.overall]"
                  />
                  <p
                    v-if="r.nonConformances"
                    class="mt-0.5 text-xs text-muted"
                  >
                    {{ r.nonConformances }} non-conformance{{ r.nonConformances === 1 ? '' : 's' }}
                  </p>
                </template>
              </td>
              <td class="hidden px-4 py-3 text-right whitespace-nowrap sm:table-cell">
                {{ formatDateMY(r.inspectionDate) }}
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
        {{ data.total }} inspection reports
      </p>
      <UPagination
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>
  </div>
</template>
