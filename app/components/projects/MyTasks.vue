<script setup lang="ts">
import type { ProjectMyTaskItem } from '~~/shared/types/projects'

/**
 * Tasks assigned to the signed-in person that are ready to work on (Step 16.9):
 * not blocked, not done, in open projects. Earliest due date first. This is what
 * the dashboard banner counts.
 */

const { data, pending, error } = await useAsyncData('projects-my-tasks', () =>
  useApiFetch<ProjectMyTaskItem[]>('/api/tools/projects/my-tasks')
)
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load your tasks"
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
        Nothing is waiting for you right now. Tasks appear here when they are assigned to you and ready to start.
      </p>

      <ul
        v-else
        :class="pending ? 'opacity-60' : ''"
        data-testid="my-tasks"
      >
        <li
          v-for="t in data"
          :key="t.id"
          class="flex flex-col gap-1 border-t border-default px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-4"
          :data-testid="`my-task-${t.id}`"
        >
          <div class="min-w-0 flex-1">
            <NuxtLink
              :to="`/tools/projects/${t.projectId}`"
              class="font-medium text-highlighted break-words hover:underline"
            >
              {{ t.title }}
            </NuxtLink>
            <p class="text-xs text-muted">
              {{ t.projectName }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge
              v-if="t.status === 'in_progress'"
              color="info"
              variant="subtle"
              label="In progress"
            />
            <span
              v-if="t.dueDate"
              class="text-sm whitespace-nowrap"
              :class="t.overdue ? 'font-medium text-error' : 'text-muted'"
            >
              due {{ formatDateMY(t.dueDate) }}<template v-if="t.overdue"> (overdue)</template>
            </span>
          </div>
        </li>
      </ul>
    </UCard>
  </div>
</template>
