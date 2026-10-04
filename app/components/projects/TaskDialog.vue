<script setup lang="ts">
import type { ProjectSectionItem, ProjectTaskItem, ProjectView } from '~~/shared/types/projects'
import { MAX_TASK_LEAD_TIME_DAYS, PROJECT_TEXT_MAX, PROJECT_TITLE_MAX } from '~~/shared/utils/projectRules'

/**
 * Add a task to a project, or edit one (Step 16.7). Anyone in the project can do
 * either; only the owner or an admin can delete. Changing what a task waits for
 * re-works its due date: a task that is waiting again loses its date, and one
 * that is free gets a date of today plus its Lead Time.
 */

const props = defineProps<{ project: ProjectView, task: ProjectTaskItem | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [], deleted: [], activity: [] }>()

const toast = useToast()
const NO_ONE = '__none'

const { data: sections } = await useAsyncData('projects-sections-pick', () =>
  useApiFetch<ProjectSectionItem[]>('/api/tools/projects/sections')
)

const form = reactive({
  title: '',
  description: '',
  /** 0 = no section, undefined = keep what the task has (edits only). */
  sectionId: 0 as number | undefined,
  assignee: NO_ONE,
  leadTimeDays: 1,
  dependsOn: [] as number[]
})
const saving = ref(false)
const confirmDelete = ref(false)

const isEdit = computed(() => props.task !== null)

watch(open, (isOpen) => {
  if (!isOpen) return
  confirmDelete.value = false
  const t = props.task
  form.title = t?.title ?? ''
  form.description = t?.description ?? ''
  form.assignee = t?.assigneeId ?? NO_ONE
  form.leadTimeDays = t?.leadTimeDays ?? 1
  form.dependsOn = t ? [...t.dependsOn] : []
  if (!t) form.sectionId = 0
  else if (!t.section) form.sectionId = 0
  else form.sectionId = (sections.value ?? []).find(s => s.name === t.section)?.id
}, { immediate: true })

const sectionItems = computed(() => [
  { label: 'No section', value: 0 },
  ...(sections.value ?? []).filter(s => s.active || s.id === form.sectionId).map(s => ({ label: s.name, value: s.id }))
])
const personItems = computed(() => [
  { label: 'Nobody yet', value: NO_ONE },
  ...props.project.members.map(m => ({ label: m.name, value: m.id }))
])
const waitItems = computed(() =>
  props.project.tasks.filter(t => t.id !== props.task?.id).map(t => ({ label: t.title, value: t.id }))
)

async function save() {
  if (!form.title.trim()) return toast.add({ title: 'The task needs a title', color: 'warning' })
  saving.value = true
  try {
    const body = {
      title: form.title,
      description: form.description.trim() || null,
      // The form uses 0 for "No section"; the server wants null (and undefined = keep).
      sectionId: form.sectionId === 0 ? null : form.sectionId,
      assigneeId: form.assignee === NO_ONE ? null : form.assignee,
      leadTimeDays: form.leadTimeDays,
      dependsOn: form.dependsOn
    }
    if (props.task) {
      await useApiFetch(`/api/tools/projects/${props.project.id}/tasks/${props.task.id}`, { method: 'PUT', body })
    } else {
      await useApiFetch(`/api/tools/projects/${props.project.id}/tasks`, { method: 'POST', body })
    }
    open.value = false
    emit('saved')
    toast.add({ title: props.task ? 'Task saved' : 'Task added', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Couldn\'t save the task', description: errorText(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!props.task) return
  saving.value = true
  try {
    await useApiFetch(`/api/tools/projects/${props.project.id}/tasks/${props.task.id}`, { method: 'DELETE' })
    open.value = false
    emit('deleted')
    toast.add({ title: 'Task deleted', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Couldn\'t delete the task', description: errorText(err), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isEdit ? 'Edit task' : 'Add a task'"
    :description="isEdit ? undefined : 'A one-off task for this project. It can wait for other tasks.'"
  >
    <template #body>
      <form
        class="space-y-4"
        @submit.prevent="save"
      >
        <UFormField
          label="Title"
          required
        >
          <UInput
            v-model="form.title"
            :maxlength="PROJECT_TITLE_MAX"
            class="w-full"
            data-testid="task-form-title"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Section">
            <USelectMenu
              v-model="form.sectionId"
              :items="sectionItems"
              value-key="value"
              :placeholder="`Keep current (${task?.section ?? 'none'})`"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Assigned to">
            <USelectMenu
              v-model="form.assignee"
              :items="personItems"
              value-key="value"
              class="w-full"
              data-testid="task-form-assignee"
            />
          </UFormField>
        </div>

        <UFormField
          label="Lead Time (working days)"
          help="Due date = the day it unlocks + this. 0 = same day."
        >
          <UInputNumber
            v-model="form.leadTimeDays"
            :min="0"
            :max="MAX_TASK_LEAD_TIME_DAYS"
            :step="1"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Waits for"
          help="Stays blocked until all of these are done."
        >
          <USelectMenu
            v-model="form.dependsOn"
            :items="waitItems"
            value-key="value"
            multiple
            placeholder="Nothing - it can start straight away"
            class="w-full"
            data-testid="task-form-waits"
          />
        </UFormField>

        <UFormField label="Notes (optional)">
          <UTextarea
            v-model="form.description"
            :rows="2"
            autoresize
            :maxlength="PROJECT_TEXT_MAX"
            class="w-full"
          />
        </UFormField>
      </form>

      <!-- Comments and files belong to a saved task, so they appear when editing. -->
      <ProjectsTaskDiscussion
        v-if="task"
        :key="task.id"
        class="mt-6"
        :project-id="project.id"
        :task-id="task.id"
        :editable="project.status === 'open'"
        @changed="emit('activity')"
      />
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center gap-2">
        <template v-if="isEdit && project.canManage">
          <UButton
            v-if="!confirmDelete"
            variant="ghost"
            color="error"
            icon="i-lucide-trash-2"
            label="Delete task"
            @click="confirmDelete = true"
          />
          <template v-else>
            <span class="text-sm text-muted">Delete this task?</span>
            <UButton
              size="sm"
              color="error"
              label="Yes, delete"
              :loading="saving"
              data-testid="task-delete-confirm"
              @click="remove"
            />
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              label="No"
              @click="confirmDelete = false"
            />
          </template>
        </template>
        <div class="ml-auto flex gap-2">
          <UButton
            variant="outline"
            color="neutral"
            label="Cancel"
            @click="open = false"
          />
          <UButton
            label="Save"
            :loading="saving"
            data-testid="task-form-save"
            @click="save"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
