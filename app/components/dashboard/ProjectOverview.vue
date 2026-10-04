<script setup lang="ts">
import type { ProjectOverview } from '~~/shared/utils/dashboardData'

/**
 * Dashboard tile (Step 19.8): a summary of the caller's open projects, taken
 * live from the Projects tool (no upload). Admins and the owner see every open
 * project; everyone else sees only projects they belong to. The page only
 * shows this tile to people who can open Projects.
 */
const { data, pending, error } = await useAsyncData('dashboard-projects', () =>
  useApiFetch<ProjectOverview>('/api/dashboard/charts/projects')
)

const totalTasks = computed(() => {
  const t = data.value?.tasks
  return t ? t.todo + t.inProgress + t.done : 0
})
const segments = computed(() => {
  const t = data.value?.tasks
  const total = totalTasks.value
  if (!t || !total) return []
  return [
    { key: 'done', label: 'Done', n: t.done, cls: 'bg-success' },
    { key: 'inProgress', label: 'In progress', n: t.inProgress, cls: 'bg-primary' },
    { key: 'todo', label: 'To do', n: t.todo, cls: 'bg-accented' }
  ].map(s => ({ ...s, pct: (s.n / total) * 100 }))
})
</script>

<template>
  <UCard data-testid="project-overview">
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-kanban"
            class="size-5 text-muted"
          />
          <span class="font-medium">Project overview</span>
        </div>
        <span
          v-if="data"
          class="text-xs text-muted"
        >{{ data.scope === 'all' ? 'All open projects' : 'Your open projects' }}</span>
      </div>
    </template>

    <p
      v-if="error"
      class="text-sm text-muted"
    >
      Couldn't load the project figures.
    </p>
    <p
      v-else-if="pending"
      class="text-sm text-muted"
    >
      Loading…
    </p>
    <div
      v-else-if="data && !data.openProjects"
      class="text-sm text-muted"
    >
      <p>No open projects.</p>
      <UButton
        class="mt-2"
        to="/tools/projects"
        size="sm"
        variant="outline"
        color="neutral"
        icon="i-lucide-kanban"
        label="Open Projects"
      />
    </div>

    <div v-else-if="data">
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-md bg-elevated p-2">
          <p
            class="text-2xl font-semibold"
            data-testid="projects-open"
          >
            {{ data.openProjects }}
          </p>
          <p class="text-xs text-muted">
            Open projects
          </p>
        </div>
        <div class="rounded-md bg-elevated p-2">
          <p
            class="text-2xl font-semibold"
            :class="data.atRiskProjects ? 'text-error' : ''"
            data-testid="projects-at-risk"
          >
            {{ data.atRiskProjects }}
          </p>
          <p class="text-xs text-muted">
            At risk
          </p>
        </div>
        <div class="rounded-md bg-elevated p-2">
          <p
            class="text-2xl font-semibold"
            :class="data.overdueTasks ? 'text-error' : ''"
            data-testid="projects-overdue"
          >
            {{ data.overdueTasks }}
          </p>
          <p class="text-xs text-muted">
            Overdue tasks
          </p>
        </div>
      </div>

      <p class="mt-4 text-xs font-medium text-muted">
        Tasks by status ({{ totalTasks }})
      </p>
      <div
        v-if="segments.length"
        class="mt-1 flex h-3 overflow-hidden rounded-full bg-accented"
        role="img"
        :aria-label="segments.map(s => `${s.label}: ${s.n}`).join(', ')"
      >
        <div
          v-for="s in segments"
          :key="s.key"
          :class="s.cls"
          :style="{ width: `${s.pct}%` }"
        />
      </div>
      <ul
        v-if="segments.length"
        class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"
      >
        <li
          v-for="s in segments"
          :key="s.key"
          class="flex items-center gap-1.5"
        >
          <span
            class="inline-block size-2.5 rounded-full"
            :class="s.cls"
          />
          {{ s.label }} {{ s.n }}
        </li>
      </ul>

      <template v-if="data.atRiskList.length">
        <p class="mt-4 text-xs font-medium text-muted">
          Most at risk
        </p>
        <ul
          class="mt-1 divide-y divide-default"
          data-testid="at-risk-list"
        >
          <li
            v-for="p in data.atRiskList"
            :key="p.id"
          >
            <NuxtLink
              :to="`/tools/projects/${p.id}`"
              class="flex items-center justify-between gap-2 py-2 text-sm hover:underline"
            >
              <span class="min-w-0 truncate">{{ p.name }}</span>
              <span class="shrink-0 text-xs text-error">
                {{ p.overdueTasks ? `${p.overdueTasks} overdue` : 'Due after target' }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </template>
      <p
        v-else
        class="mt-4 text-sm text-success"
      >
        No projects are at risk.
      </p>
    </div>
  </UCard>
</template>
