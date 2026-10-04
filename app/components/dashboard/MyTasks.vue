<script setup lang="ts">
import type { ProjectMyTaskItem } from '~~/shared/types/projects'

/**
 * Dashboard tile (Step 20.2): tasks assigned to this person in Projects that are
 * ready to work on (not blocked, not done), earliest due date first. The page
 * only shows this tile to people who can open Projects.
 */
const MAX_SHOWN = 8

const { data: tasks, pending, error } = await useAsyncData('dashboard-my-tasks-widget', () =>
  useApiFetch<ProjectMyTaskItem[]>('/api/tools/projects/my-tasks')
)
const shown = computed(() => (tasks.value ?? []).slice(0, MAX_SHOWN))
const overdueCount = computed(() => (tasks.value ?? []).filter(t => t.overdue).length)
</script>

<template>
  <UCard
    class="h-full"
    :ui="{ root: 'flex h-full flex-col', body: 'min-h-0 flex-1 overflow-y-auto' }"
    data-testid="my-tasks"
  >
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-list-checks"
            class="size-5 text-muted"
          />
          <span class="font-medium">My tasks</span>
        </div>
        <UBadge
          v-if="overdueCount"
          color="error"
          variant="subtle"
          :label="`${overdueCount} overdue`"
        />
      </div>
    </template>

    <p
      v-if="error"
      class="text-sm text-muted"
    >
      Couldn't load your tasks.
    </p>
    <p
      v-else-if="pending"
      class="text-sm text-muted"
    >
      Loading…
    </p>
    <p
      v-else-if="!shown.length"
      class="text-sm text-muted"
    >
      Nothing is waiting for you.
    </p>
    <ul
      v-else
      class="space-y-2 text-sm"
    >
      <li
        v-for="task in shown"
        :key="task.id"
      >
        <NuxtLink
          :to="`/tools/projects/${task.projectId}`"
          class="block hover:underline"
        >
          <span class="font-medium">{{ task.title }}</span>
        </NuxtLink>
        <p class="text-xs text-muted">
          {{ task.projectName }}
          <template v-if="task.dueDate">
            · due
            <span :class="task.overdue ? 'font-medium text-error' : ''">{{ formatDateMY(task.dueDate) }}</span>
          </template>
        </p>
      </li>
    </ul>
    <p
      v-if="(tasks?.length ?? 0) > MAX_SHOWN"
      class="mt-2 text-xs text-muted"
    >
      +{{ (tasks?.length ?? 0) - MAX_SHOWN }} more
    </p>

    <template #footer>
      <UButton
        to="/tools/projects?tab=mine"
        variant="link"
        color="neutral"
        size="sm"
        class="p-0"
        label="Open all my tasks"
        trailing-icon="i-lucide-arrow-right"
      />
    </template>
  </UCard>
</template>
