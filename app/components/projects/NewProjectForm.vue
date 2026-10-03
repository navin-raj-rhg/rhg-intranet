<script setup lang="ts">
import type { ProjectPerson, ProjectTypeItem } from '~~/shared/types/projects'
import { PROJECT_NAME_MAX, PROJECT_TEXT_MAX } from '~~/shared/utils/projectRules'

/**
 * Start a project (Step 16.6): name it, pick a type (or none for a blank
 * project), set the start date and who is in it. The type's tasks are copied in,
 * the first ones get due dates from the start date, and the rest wait until the
 * tasks they depend on are done.
 */

const authStore = useAuthStore()
const toast = useToast()

const [typesReq, peopleReq] = await Promise.all([
  useAsyncData('projects-new-types', () => useApiFetch<ProjectTypeItem[]>('/api/tools/projects/types')),
  useAsyncData('projects-people', () => useApiFetch<ProjectPerson[]>('/api/tools/projects/people'))
])

const BLANK = 0
const loadError = computed(() => typesReq.error.value || peopleReq.error.value)
const typeItems = computed(() => [
  ...(typesReq.data.value ?? []).filter(t => t.active).map(t => ({ label: t.name, value: t.id })),
  { label: 'Blank project (no tasks, add them by hand)', value: BLANK }
])
// Everyone except the person starting it, who is always in the project.
const memberItems = computed(() =>
  (peopleReq.data.value ?? []).filter(p => p.id !== authStore.profile?.id).map(p => ({ label: p.name, value: p.id }))
)

const name = ref('')
const typeId = ref<number | undefined>()
const startDate = ref(todayMY())
const targetDate = ref('')
const products = ref('')
const notes = ref('')
const memberIds = ref<string[]>([])
const saving = ref(false)

async function start() {
  if (!name.value.trim()) return toast.add({ title: 'Give the project a name', color: 'warning' })
  if (typeId.value === undefined) return toast.add({ title: 'Choose a project type, or a blank project', color: 'warning' })
  if (!startDate.value) return toast.add({ title: 'Choose a start date', color: 'warning' })
  if (targetDate.value && targetDate.value < startDate.value) {
    return toast.add({ title: 'The target date can\'t be before the start date', color: 'warning' })
  }

  saving.value = true
  try {
    await useApiFetch('/api/tools/projects', {
      method: 'POST',
      body: {
        name: name.value,
        typeId: typeId.value === BLANK ? null : typeId.value,
        startDate: startDate.value,
        targetDate: targetDate.value || null,
        products: products.value.trim() || null,
        notes: notes.value.trim() || null,
        memberIds: memberIds.value
      }
    })
    toast.add({ title: 'Project started', color: 'success' })
    await navigateTo('/tools/projects')
  } catch (err) {
    toast.add({ title: 'Couldn\'t start the project', description: errorText(err), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UAlert
    v-if="loadError"
    color="error"
    variant="subtle"
    title="Couldn't load the form"
    :description="errorText(loadError)"
  />

  <form
    v-else
    class="space-y-6"
    @submit.prevent="start"
  >
    <UCard>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Project name"
          required
          class="sm:col-span-2"
        >
          <UInput
            v-model="name"
            :maxlength="PROJECT_NAME_MAX"
            placeholder="e.g. Spring range launch"
            class="w-full"
            data-testid="project-name"
          />
        </UFormField>

        <UFormField
          label="Project type"
          required
          help="Decides which tasks the project starts with."
        >
          <USelect
            v-model="typeId"
            :items="typeItems"
            placeholder="Choose…"
            class="w-full"
            data-testid="project-type"
          />
        </UFormField>

        <UFormField
          label="Members"
          help="Who can see this project. People given a task are added automatically. You are always in."
        >
          <USelectMenu
            v-model="memberIds"
            :items="memberItems"
            value-key="value"
            multiple
            placeholder="Add people (optional)"
            class="w-full"
            data-testid="project-members"
          />
        </UFormField>

        <UFormField
          label="Start date"
          required
          help="The first tasks get their due dates from this."
        >
          <UInput
            v-model="startDate"
            type="date"
            class="w-full"
            data-testid="project-start"
          />
        </UFormField>

        <UFormField
          label="Target date"
          help="Optional. Used only to flag the project as at risk; it never moves a due date."
        >
          <UInput
            v-model="targetDate"
            type="date"
            class="w-full"
            data-testid="project-target"
          />
        </UFormField>

        <UFormField
          label="Products (optional)"
          class="sm:col-span-2"
        >
          <UInput
            v-model="products"
            :maxlength="PROJECT_TEXT_MAX"
            placeholder="Product numbers or names, e.g. HH-100, HH-101"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Notes (optional)"
          class="sm:col-span-2"
        >
          <UTextarea
            v-model="notes"
            :rows="2"
            autoresize
            :maxlength="PROJECT_TEXT_MAX"
            class="w-full"
          />
        </UFormField>
      </div>
    </UCard>

    <div class="flex flex-wrap gap-3">
      <UButton
        type="submit"
        icon="i-lucide-rocket"
        label="Start project"
        :loading="saving"
        data-testid="start-project"
      />
      <UButton
        to="/tools/projects"
        variant="ghost"
        color="neutral"
        label="Cancel"
      />
    </div>
  </form>
</template>
