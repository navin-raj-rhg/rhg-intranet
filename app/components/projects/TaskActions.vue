<script setup lang="ts">
import type { ProjectTaskItem } from '~~/shared/types/projects'
import type { ProjectTaskStatus } from '~~/shared/utils/projectRules'

/**
 * The status buttons for one task (Step 16.7): Start / Done, Back to To do,
 * or Reopen. A blocked task has none (it is waiting for other tasks), and
 * people who may not change the task see none either. The server enforces the
 * same rules.
 */

defineProps<{ task: ProjectTaskItem, canChange: boolean, busy: boolean }>()
defineEmits<{ status: [next: ProjectTaskStatus] }>()
</script>

<template>
  <div
    v-if="canChange && !(task.blocked && task.status !== 'done')"
    class="flex flex-wrap items-center gap-2"
  >
    <template v-if="task.status === 'todo'">
      <UButton
        size="xs"
        variant="outline"
        color="neutral"
        label="Start"
        :loading="busy"
        data-testid="task-start"
        @click.stop="$emit('status', 'in_progress')"
      />
      <UButton
        size="xs"
        icon="i-lucide-check"
        label="Done"
        :loading="busy"
        data-testid="task-done"
        @click.stop="$emit('status', 'done')"
      />
    </template>
    <template v-else-if="task.status === 'in_progress'">
      <UButton
        size="xs"
        icon="i-lucide-check"
        label="Done"
        :loading="busy"
        data-testid="task-done"
        @click.stop="$emit('status', 'done')"
      />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        label="Back to To do"
        :loading="busy"
        @click.stop="$emit('status', 'todo')"
      />
    </template>
    <UButton
      v-else
      size="xs"
      variant="outline"
      color="neutral"
      icon="i-lucide-rotate-ccw"
      label="Reopen"
      :loading="busy"
      data-testid="task-reopen"
      @click.stop="$emit('status', 'todo')"
    />
  </div>
</template>
