<script setup lang="ts">
import type { ProjectPerson, ProjectTemplateResponse } from '~~/shared/types/projects'
import {
  MAX_TASK_LEAD_TIME_DAYS,
  PROJECT_TEXT_MAX,
  PROJECT_TITLE_MAX,
  templateTaskProblems
} from '~~/shared/utils/projectRules'

/**
 * The master task list (Step 16.5, admins only). One list shared by every
 * project type: each task is ticked for the types it applies to, has a default
 * person, a Lead Time (working days from when it unlocks) and the tasks it
 * waits for. Starting a project copies the ticked tasks, so saving here never
 * changes projects already running.
 */

const toast = useToast()
const NO_ONE = '__none'

const { data, error, refresh } = await useAsyncData('projects-template', () =>
  useApiFetch<ProjectTemplateResponse>('/api/tools/projects/template')
)
const { data: people } = await useAsyncData('projects-people', () =>
  useApiFetch<ProjectPerson[]>('/api/tools/projects/people')
)

interface TaskForm {
  key: string
  /** Set for saved tasks; new tasks have none. */
  id?: number
  title: string
  description: string
  assignee: string
  leadTimeDays: number
  active: boolean
  typeIds: number[]
  dependsOn: string[]
}

let nextNew = 1
const tasks = ref<TaskForm[]>([])
const baseline = ref('')
const saving = ref(false)
const showProblems = ref(false)

const types = computed(() => (data.value?.types ?? []).filter(t => t.active))
const personItems = computed(() => [
  { label: 'No default person', value: NO_ONE },
  ...(people.value ?? []).map(p => ({ label: p.name, value: p.id }))
])

function load() {
  tasks.value = (data.value?.tasks ?? []).map(t => ({
    key: t.key,
    id: Number(t.key),
    title: t.title,
    description: t.description ?? '',
    assignee: t.assigneeId ?? NO_ONE,
    leadTimeDays: t.leadTimeDays,
    active: t.active,
    typeIds: [...t.typeIds],
    dependsOn: [...t.dependsOn]
  }))
  baseline.value = JSON.stringify(tasks.value)
}
load()

const dirty = computed(() => JSON.stringify(tasks.value) !== baseline.value)

const problems = computed(() =>
  templateTaskProblems(tasks.value.map(t => ({
    key: t.key,
    title: t.title,
    description: t.description || null,
    assigneeId: null,
    leadTimeDays: t.leadTimeDays,
    active: t.active,
    typeIds: t.typeIds,
    dependsOn: t.dependsOn
  }))))

function addTask() {
  tasks.value.push({
    key: `new-${nextNew++}`,
    title: '',
    description: '',
    assignee: NO_ONE,
    leadTimeDays: 1,
    active: true,
    typeIds: types.value.map(t => t.id),
    dependsOn: []
  })
}

function move(index: number, by: -1 | 1) {
  const target = index + by
  if (target < 0 || target >= tasks.value.length) return
  const [item] = tasks.value.splice(index, 1)
  tasks.value.splice(target, 0, item!)
}

function removeTask(index: number) {
  const [gone] = tasks.value.splice(index, 1)
  // Tasks that waited for it no longer do.
  for (const t of tasks.value) t.dependsOn = t.dependsOn.filter(k => k !== gone!.key)
}

function toggleType(t: TaskForm, typeId: number, on: boolean) {
  t.typeIds = on ? [...new Set([...t.typeIds, typeId])] : t.typeIds.filter(id => id !== typeId)
}

/** The other tasks this one could wait for. */
function waitItems(self: TaskForm) {
  return tasks.value
    .filter(t => t.key !== self.key)
    .map(t => ({ label: t.title.trim() || '(untitled task)', value: t.key }))
}

const nameOf = (typeId: number) => data.value?.types.find(t => t.id === typeId)?.name ?? ''

async function save(): Promise<boolean> {
  if (problems.value.length) {
    showProblems.value = true
    return false
  }
  saving.value = true
  try {
    await useApiFetch('/api/tools/projects/template', {
      method: 'PUT',
      body: {
        tasks: tasks.value.map(t => ({
          key: t.key,
          id: t.id,
          title: t.title,
          description: t.description.trim() || null,
          assigneeId: t.assignee === NO_ONE ? null : t.assignee,
          leadTimeDays: t.leadTimeDays,
          active: t.active,
          typeIds: t.typeIds,
          dependsOn: t.dependsOn
        }))
      }
    })
    await refresh()
    load()
    showProblems.value = false
    toast.add({ title: 'Task list saved', description: 'It applies to projects started from now on.', color: 'success' })
    return true
  } catch (err) {
    toast.add({ title: 'Couldn\'t save the task list', description: errorText(err), color: 'error' })
    return false
  } finally {
    saving.value = false
  }
}

// Leaving the page with unsaved changes asks first, in our own dialog (some
// embedded browsers silently block the browser's built-in confirm box).
const beforeUnload = (e: BeforeUnloadEvent) => {
  if (dirty.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

const leaveOpen = ref(false)
let answerLeave: ((leave: boolean) => void) | null = null

onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return new Promise<boolean>((resolve) => {
    answerLeave = resolve
    leaveOpen.value = true
  })
})

function decideLeave(leave: boolean) {
  const answer = answerLeave
  answerLeave = null
  leaveOpen.value = false
  answer?.(leave)
}

// Closing the dialog any other way (Escape, the X) means "stay".
watch(leaveOpen, (open) => {
  if (!open && answerLeave) decideLeave(false)
})

async function saveAndLeave() {
  if (await save()) decideLeave(true)
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load the task list"
      :description="errorText(error)"
    />

    <template v-else>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p class="min-w-0 flex-1 text-sm text-muted">
          One list for every project type. Tick the types each task applies to. When a project starts, the ticked tasks are
          copied in; a task is blocked until everything it waits for is done, then it gets a due date of that day plus its
          Lead Time (working days, Monday to Friday, skipping public holidays).
        </p>
        <div class="flex items-center gap-3">
          <UBadge
            v-if="dirty"
            color="warning"
            variant="subtle"
            label="Unsaved changes"
            data-testid="template-dirty"
          />
          <UButton
            icon="i-lucide-save"
            label="Save task list"
            :loading="saving"
            data-testid="save-template"
            @click="save"
          />
        </div>
      </div>

      <UAlert
        v-if="showProblems && problems.length"
        color="warning"
        variant="subtle"
        title="Fix these before saving"
      >
        <template #description>
          <ul class="list-disc pl-5">
            <li
              v-for="p in problems"
              :key="p"
            >
              {{ p }}
            </li>
          </ul>
        </template>
      </UAlert>

      <UAlert
        v-if="!types.length"
        color="info"
        variant="subtle"
        title="No project types are switched on"
        description="Add or switch on a project type in the Project types tab, then tick it here."
      />

      <p
        v-if="!tasks.length"
        class="text-sm text-muted"
      >
        No tasks yet. Add the first one below.
      </p>

      <UCard
        v-for="(t, i) in tasks"
        :key="t.key"
        :data-testid="`task-${i}`"
      >
        <template #header>
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex min-w-0 basis-full items-center gap-2 sm:basis-0 sm:flex-1">
              <span class="w-6 text-right text-sm text-muted">{{ i + 1 }}.</span>
              <UInput
                v-model="t.title"
                :maxlength="PROJECT_TITLE_MAX"
                placeholder="Task title, e.g. Upload product images"
                class="min-w-0 flex-1 font-semibold"
                aria-label="Task title"
                data-testid="task-title"
              />
            </div>
            <UBadge
              v-if="!t.active"
              color="neutral"
              variant="subtle"
              label="Switched off"
            />
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              icon="i-lucide-arrow-up"
              aria-label="Move task up"
              :disabled="i === 0"
              @click="move(i, -1)"
            />
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              icon="i-lucide-arrow-down"
              aria-label="Move task down"
              :disabled="i === tasks.length - 1"
              @click="move(i, 1)"
            />
            <UButton
              size="sm"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              aria-label="Remove task"
              @click="removeTask(i)"
            />
          </div>
        </template>

        <div class="grid gap-4 md:grid-cols-3">
          <UFormField label="Default person">
            <USelectMenu
              v-model="t.assignee"
              :items="personItems"
              value-key="value"
              class="w-full"
              data-testid="task-assignee"
            />
          </UFormField>
          <UFormField
            label="Lead Time (working days)"
            :help="`Due date = the day it unlocks + this. 0 = same day.`"
          >
            <UInputNumber
              v-model="t.leadTimeDays"
              :min="0"
              :max="MAX_TASK_LEAD_TIME_DAYS"
              :step="1"
              class="w-full"
              data-testid="task-lead-time"
            />
          </UFormField>
          <UFormField label="Available for new projects">
            <USwitch
              v-model="t.active"
              :label="t.active ? 'On' : 'Switched off'"
            />
          </UFormField>

          <UFormField
            label="Applies to"
            class="md:col-span-3"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5">
              <UCheckbox
                v-for="ty in types"
                :key="ty.id"
                :model-value="t.typeIds.includes(ty.id)"
                :label="ty.name"
                :data-testid="`task-type-${ty.id}`"
                @update:model-value="toggleType(t, ty.id, $event === true)"
              />
              <span
                v-for="id in t.typeIds.filter(id => !types.some(ty => ty.id === id))"
                :key="id"
                class="text-sm text-muted"
              >{{ nameOf(id) }} (switched off)</span>
            </div>
          </UFormField>

          <UFormField
            label="Waits for"
            help="This task stays blocked until all of these are done. If a project type leaves one out, the link skips over it."
            class="md:col-span-3"
          >
            <USelectMenu
              v-model="t.dependsOn"
              :items="waitItems(t)"
              value-key="value"
              multiple
              placeholder="Nothing - it can start straight away"
              class="w-full"
              data-testid="task-waits-for"
            />
          </UFormField>

          <UFormField
            label="Notes for whoever does it (optional)"
            class="md:col-span-3"
          >
            <UTextarea
              v-model="t.description"
              :rows="1"
              autoresize
              :maxlength="PROJECT_TEXT_MAX"
              class="w-full"
              aria-label="Task notes"
            />
          </UFormField>
        </div>
      </UCard>

      <div class="flex flex-wrap gap-3">
        <UButton
          variant="outline"
          color="neutral"
          icon="i-lucide-plus"
          label="Add task"
          data-testid="add-task"
          @click="addTask"
        />
        <UButton
          icon="i-lucide-save"
          label="Save task list"
          :loading="saving"
          @click="save"
        />
      </div>
    </template>

    <UModal
      v-model:open="leaveOpen"
      title="Leave without saving?"
      description="You have changes to the task list that haven't been saved."
    >
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton
            label="Stay on this page"
            color="neutral"
            variant="outline"
            data-testid="leave-stay"
            @click="decideLeave(false)"
          />
          <UButton
            label="Leave without saving"
            color="error"
            variant="outline"
            data-testid="leave-discard"
            @click="decideLeave(true)"
          />
          <UButton
            label="Save and leave"
            :loading="saving"
            data-testid="leave-save"
            @click="saveAndLeave"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
