<script setup lang="ts">
import type { ProjectTaskItem, ProjectTaskStatusResponse, ProjectView } from '~~/shared/types/projects'
import type { ProjectTaskStatus } from '~~/shared/utils/projectRules'

/**
 * One project (Step 16.7): its tasks as a list grouped by section, or as a
 * board (To do / In progress / Done). A task that is waiting for others shows as
 * Blocked with no due date; when the last task it waits for is finished it
 * unlocks and gets its date. Each task's dialog also holds its comments and attached files (16.8).
 */

const props = defineProps<{ projectId: number, isAdmin: boolean }>()

const authStore = useAuthStore()
const toast = useToast()

const { data: project, error, refresh } = await useAsyncData(`project-${props.projectId}`, () =>
  useApiFetch<ProjectView>(`/api/tools/projects/${props.projectId}`)
)

const view = ref<'list' | 'board'>('list')
const viewItems = [
  { label: 'List', value: 'list', icon: 'i-lucide-list' },
  { label: 'Board', value: 'board', icon: 'i-lucide-columns-3' }
]

const tasks = computed(() => project.value?.tasks ?? [])
const titleOf = (id: number) => tasks.value.find(t => t.id === id)?.title ?? 'a removed task'

/** The unfinished tasks this one is waiting for. */
const waitingFor = (t: ProjectTaskItem) =>
  t.dependsOn.filter(id => tasks.value.find(x => x.id === id)?.status !== 'done').map(titleOf)

const canChange = (t: ProjectTaskItem) =>
  !!project.value && project.value.status === 'open' && (project.value.canManage || t.assigneeId === authStore.profile?.id)

// The list, grouped by section in the order the server sent them.
const groups = computed(() => {
  const out: { name: string, tasks: ProjectTaskItem[] }[] = []
  for (const t of tasks.value) {
    const name = t.section ?? ''
    const last = out[out.length - 1]
    if (last && last.name === name) last.tasks.push(t)
    else out.push({ name, tasks: [t] })
  }
  return out
})
const showHeadings = computed(() => groups.value.some(g => g.name !== ''))

const columns = computed(() => [
  { status: 'todo' as const, label: 'To do', tasks: tasks.value.filter(t => t.status === 'todo') },
  { status: 'in_progress' as const, label: 'In progress', tasks: tasks.value.filter(t => t.status === 'in_progress') },
  { status: 'done' as const, label: 'Done', tasks: tasks.value.filter(t => t.status === 'done') }
])

const done = computed(() => tasks.value.filter(t => t.status === 'done').length)
const percent = computed(() => (tasks.value.length ? Math.round((done.value / tasks.value.length) * 100) : 0))

/* ---- status changes ---- */

const busyId = ref<number | null>(null)

async function setStatus(t: ProjectTaskItem, next: ProjectTaskStatus) {
  busyId.value = t.id
  try {
    const res = await useApiFetch<ProjectTaskStatusResponse>(
      `/api/tools/projects/${props.projectId}/tasks/${t.id}/status`,
      { method: 'POST', body: { status: next } }
    )
    await refresh()
    if (res.unlocked.length) {
      toast.add({ title: 'Now unlocked', description: `${res.unlocked.join(', ')} - given a due date.`, color: 'success' })
    }
    if (res.reblocked.length) {
      toast.add({ title: 'Put back on hold', description: `${res.reblocked.join(', ')} - waiting again, due date cleared.`, color: 'warning' })
    }
    if (res.warn.length) {
      toast.add({ title: 'Already started, left as they are', description: res.warn.join(', '), color: 'warning' })
    }
  } catch (err) {
    toast.add({ title: 'Couldn\'t change the task', description: errorText(err), color: 'error' })
    await refresh()
  } finally {
    busyId.value = null
  }
}

/* ---- dialogs ---- */

const taskOpen = ref(false)
const editing = ref<ProjectTaskItem | null>(null)
const settingsOpen = ref(false)

function openTask(t: ProjectTaskItem | null) {
  editing.value = t
  taskOpen.value = true
}

const confirm = reactive({
  open: false,
  title: '',
  description: '',
  label: '',
  danger: false,
  run: async () => {}
})
const confirming = ref(false)

function ask(opts: { title: string, description: string, label: string, danger?: boolean, run: () => Promise<void> }) {
  Object.assign(confirm, { open: true, danger: false, ...opts })
}

async function runConfirm() {
  confirming.value = true
  try {
    await confirm.run()
    confirm.open = false
  } catch (err) {
    toast.add({ title: 'That didn\'t work', description: errorText(err), color: 'error' })
  } finally {
    confirming.value = false
  }
}

function toggleClosed() {
  const p = project.value!
  const closing = p.status === 'open'
  const open = tasks.value.length - done.value
  ask({
    title: closing ? 'Close this project?' : 'Reopen this project?',
    description: closing
      ? (open ? `${open} task${open === 1 ? ' is' : 's are'} not finished. Closed projects can't be changed until reopened.` : 'Every task is done. Closed projects can\'t be changed until reopened.')
      : 'Tasks can be changed again.',
    label: closing ? 'Close project' : 'Reopen project',
    run: async () => {
      await useApiFetch(`/api/tools/projects/${props.projectId}/status`, { method: 'POST', body: { status: closing ? 'closed' : 'open' } })
      await refresh()
    }
  })
}

function deleteProject() {
  ask({
    title: 'Delete this project?',
    description: 'The project, all its tasks and comments are removed for good. This can\'t be undone.',
    label: 'Delete project',
    danger: true,
    run: async () => {
      await useApiFetch(`/api/tools/projects/${props.projectId}`, { method: 'DELETE' })
      await navigateTo('/tools/projects')
    }
  })
}

const statusLabel: Record<ProjectTaskStatus, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' }
const statusColor: Record<ProjectTaskStatus, 'neutral' | 'info' | 'success'> = { todo: 'neutral', in_progress: 'info', done: 'success' }
</script>

<template>
  <UAlert
    v-if="error || !project"
    color="error"
    variant="subtle"
    title="Couldn't open this project"
    :description="error ? errorText(error) : 'It may have been deleted, or you are not a member of it.'"
  />

  <div
    v-else
    class="space-y-6"
  >
    <!-- Header -->
    <UCard>
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2
              class="text-xl font-semibold break-words"
              data-testid="project-title"
            >
              {{ project.name }}
            </h2>
            <UBadge
              v-if="project.status === 'closed'"
              color="neutral"
              variant="subtle"
              label="Closed"
            />
            <UBadge
              v-else-if="project.atRisk"
              color="error"
              variant="subtle"
              label="At risk"
            />
          </div>
          <p class="text-sm text-muted">
            {{ project.typeName ?? 'Blank project' }} · owner {{ project.ownerName }} · starts {{ formatDateMY(project.startDate) }}<template v-if="project.targetDate">
              · target {{ formatDateMY(project.targetDate) }}
            </template>
          </p>
          <p
            v-if="project.products"
            class="text-sm"
          >
            <span class="text-muted">Products:</span> {{ project.products }}
          </p>
          <p
            v-if="project.notes"
            class="text-sm whitespace-pre-line"
          >
            {{ project.notes }}
          </p>
          <p class="text-xs text-muted">
            Members: {{ project.members.map(m => m.name).join(', ') }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2 sm:justify-end">
          <UButton
            v-if="project.canManage"
            variant="outline"
            color="neutral"
            icon="i-lucide-settings"
            label="Settings"
            data-testid="project-settings"
            @click="settingsOpen = true"
          />
          <UButton
            v-if="project.canManage"
            variant="outline"
            color="neutral"
            :icon="project.status === 'open' ? 'i-lucide-lock' : 'i-lucide-lock-open'"
            :label="project.status === 'open' ? 'Close' : 'Reopen'"
            data-testid="project-toggle-closed"
            @click="toggleClosed"
          />
          <UButton
            v-if="isAdmin"
            variant="ghost"
            color="error"
            icon="i-lucide-trash-2"
            label="Delete"
            @click="deleteProject"
          />
        </div>
      </div>

      <div
        v-if="tasks.length"
        class="mt-4"
      >
        <div class="mb-1 flex justify-between text-sm text-muted">
          <span>{{ done }} of {{ tasks.length }} tasks done</span>
          <span>{{ percent }}%</span>
        </div>
        <div
          class="h-2 overflow-hidden rounded-full bg-elevated"
          role="progressbar"
          :aria-valuenow="percent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="h-full rounded-full bg-primary"
            :style="{ width: `${percent}%` }"
          />
        </div>
      </div>
    </UCard>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-3">
      <UTabs
        v-model="view"
        :items="viewItems"
        :content="false"
        class="w-full sm:w-64"
        data-testid="view-switch"
      />
      <UButton
        v-if="project.status === 'open'"
        class="sm:ml-auto"
        icon="i-lucide-plus"
        label="Add task"
        data-testid="add-task"
        @click="openTask(null)"
      />
    </div>

    <UAlert
      v-if="!tasks.length"
      color="info"
      variant="subtle"
      title="No tasks yet"
      description="This project has no tasks. Use Add task to create one."
    />

    <!-- List view -->
    <template v-else-if="view === 'list'">
      <section
        v-for="(g, gi) in groups"
        :key="gi"
        class="space-y-2"
      >
        <h3
          v-if="showHeadings"
          class="flex items-center gap-2 border-b border-default pb-1 text-lg font-semibold"
        >
          {{ g.name || 'No section' }}
          <span class="text-sm font-normal text-muted">{{ g.tasks.length }}</span>
        </h3>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <ul>
            <li
              v-for="t in g.tasks"
              :key="t.id"
              class="flex flex-col gap-2 border-t border-default px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-4"
              :data-testid="`task-row-${t.id}`"
            >
              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                @click="openTask(t)"
              >
                <p
                  class="font-medium break-words"
                  :class="t.status === 'done' ? 'text-muted line-through' : 'text-highlighted'"
                >
                  {{ t.title }}
                </p>
                <p class="text-xs text-muted">
                  {{ t.assigneeName ?? 'Unassigned' }}
                  <template v-if="t.dueDate">
                    ·
                    <span :class="t.overdue ? 'font-medium text-error' : ''">
                      {{ t.status === 'done' ? 'was due' : 'due' }} {{ formatDateMY(t.dueDate) }}<template v-if="t.overdue"> (overdue)</template>
                    </span>
                  </template>
                  <template v-if="t.commentCount">
                    · {{ t.commentCount }} comment{{ t.commentCount === 1 ? '' : 's' }}
                  </template>
                  <template v-if="t.fileCount">
                    · {{ t.fileCount }} file{{ t.fileCount === 1 ? '' : 's' }}
                  </template>
                </p>
                <p
                  v-if="t.blocked"
                  class="mt-0.5 text-xs text-warning"
                >
                  Waiting for: {{ waitingFor(t).join(', ') }}
                </p>
              </button>

              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  v-if="t.blocked"
                  color="warning"
                  variant="subtle"
                  icon="i-lucide-lock"
                  label="Blocked"
                />
                <UBadge
                  v-else
                  :color="statusColor[t.status]"
                  variant="subtle"
                  :label="statusLabel[t.status]"
                />
                <ProjectsTaskActions
                  :task="t"
                  :can-change="canChange(t)"
                  :busy="busyId === t.id"
                  @status="setStatus(t, $event)"
                />
              </div>
            </li>
          </ul>
        </UCard>
      </section>
    </template>

    <!-- Board view -->
    <div
      v-else
      class="grid gap-4 md:grid-cols-3"
      data-testid="board"
    >
      <section
        v-for="c in columns"
        :key="c.status"
        class="space-y-3 rounded-lg bg-elevated/40 p-3"
      >
        <h3 class="flex items-center gap-2 font-semibold">
          {{ c.label }}
          <span class="text-sm font-normal text-muted">{{ c.tasks.length }}</span>
        </h3>
        <p
          v-if="!c.tasks.length"
          class="text-sm text-dimmed"
        >
          Nothing here.
        </p>
        <UCard
          v-for="t in c.tasks"
          :key="t.id"
          class="cursor-pointer"
          :data-testid="`board-card-${t.id}`"
          @click="openTask(t)"
        >
          <p
            class="font-medium break-words"
            :class="t.status === 'done' ? 'text-muted line-through' : 'text-highlighted'"
          >
            {{ t.title }}
          </p>
          <p
            v-if="t.section"
            class="text-xs text-muted"
          >
            {{ t.section }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ t.assigneeName ?? 'Unassigned' }}
            <template v-if="t.dueDate">
              ·
              <span :class="t.overdue ? 'font-medium text-error' : ''">due {{ formatDateMY(t.dueDate) }}</span>
            </template>
          </p>
          <p
            v-if="t.blocked"
            class="mt-1 flex items-start gap-1 text-xs text-warning"
          >
            <UIcon
              name="i-lucide-lock"
              class="mt-0.5 size-3 shrink-0"
            />
            Waiting for: {{ waitingFor(t).join(', ') }}
          </p>
          <div class="mt-2">
            <ProjectsTaskActions
              :task="t"
              :can-change="canChange(t)"
              :busy="busyId === t.id"
              @status="setStatus(t, $event)"
            />
          </div>
        </UCard>
      </section>
    </div>

    <ProjectsTaskDialog
      v-model:open="taskOpen"
      :project="project"
      :task="editing"
      @saved="refresh"
      @deleted="refresh"
      @activity="refresh"
    />
    <ProjectsSettingsDialog
      v-if="project.canManage"
      v-model:open="settingsOpen"
      :project="project"
      @saved="refresh"
    />

    <UModal
      v-model:open="confirm.open"
      :title="confirm.title"
      :description="confirm.description"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="outline"
            color="neutral"
            label="Cancel"
            @click="confirm.open = false"
          />
          <UButton
            :color="confirm.danger ? 'error' : 'primary'"
            :label="confirm.label"
            :loading="confirming"
            data-testid="confirm-yes"
            @click="runConfirm"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
