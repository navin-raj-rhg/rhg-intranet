<script setup lang="ts">
import type { ProjectListItem } from '~~/shared/types/projects'

/**
 * The projects the signed-in person is a member of (Step 16.6). Admins can also
 * switch to every project. Shows how far along each one is, what's overdue and
 * whether it's "at risk" (an open task is overdue or due after the target date).
 */

const props = defineProps<{ isAdmin: boolean }>()

const status = ref<'open' | 'closed' | 'all'>('open')
const showAll = ref(false)

const statusItems = [
  { label: 'Open projects', value: 'open' },
  { label: 'Closed projects', value: 'closed' },
  { label: 'All statuses', value: 'all' }
]

const { data, pending, error } = await useAsyncData(
  'projects-list',
  () => useApiFetch<ProjectListItem[]>('/api/tools/projects', {
    query: {
      status: status.value === 'all' ? undefined : status.value,
      all: props.isAdmin && showAll.value ? '1' : undefined
    }
  }),
  { watch: [status, showAll] }
)

const percent = (p: ProjectListItem) => {
  const total = p.openTasks + p.doneTasks
  return total ? Math.round((p.doneTasks / total) * 100) : 0
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <USelect
        v-model="status"
        :items="statusItems"
        class="w-full sm:w-48"
        aria-label="Filter by status"
      />
      <USwitch
        v-if="isAdmin"
        v-model="showAll"
        label="Show every project (admin)"
        data-testid="projects-show-all"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load projects"
      :description="errorText(error)"
    />

    <UCard
      v-else
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <p
        v-if="!data?.length && !pending"
        class="p-6 text-sm text-muted"
      >
        <template v-if="status === 'open'">
          No open projects{{ showAll ? '' : ' that you are a member of' }}. Use "New project" to start one.
        </template>
        <template v-else>
          Nothing to show here.
        </template>
      </p>

      <ul
        v-else
        :class="pending ? 'opacity-60' : ''"
        data-testid="projects-list"
      >
        <li
          v-for="p in data"
          :key="p.id"
          class="flex flex-col gap-2 border-t border-default px-4 py-4 first:border-t-0 sm:flex-row sm:items-center sm:gap-6"
          :data-testid="`project-row-${p.id}`"
        >
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted break-words">
              {{ p.name }}
            </p>
            <p class="text-xs text-muted">
              {{ p.typeName ?? 'Blank project' }} · owner {{ p.ownerName }} · starts {{ formatDateMY(p.startDate) }}<template v-if="p.targetDate">
                · target {{ formatDateMY(p.targetDate) }}
              </template>
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2 sm:justify-end">
            <UBadge
              v-if="p.status === 'closed'"
              color="neutral"
              variant="subtle"
              label="Closed"
            />
            <UBadge
              v-else-if="p.atRisk"
              color="error"
              variant="subtle"
              label="At risk"
            />
            <UBadge
              v-if="p.overdueTasks"
              color="warning"
              variant="subtle"
              :label="`${p.overdueTasks} overdue`"
            />
            <span class="text-sm text-muted whitespace-nowrap">
              {{ p.doneTasks }} of {{ p.openTasks + p.doneTasks }} tasks done
              <template v-if="p.openTasks + p.doneTasks">({{ percent(p) }}%)</template>
            </span>
          </div>
        </li>
      </ul>
    </UCard>
  </div>
</template>
