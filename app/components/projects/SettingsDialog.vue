<script setup lang="ts">
import type { ProjectPerson, ProjectView } from '~~/shared/types/projects'
import { PROJECT_NAME_MAX, PROJECT_TEXT_MAX } from '~~/shared/utils/projectRules'

/**
 * A project's details and who is in it (Step 16.7). Only the project owner or an
 * admin opens this. Someone who still has unfinished tasks can't be removed
 * until those tasks are given to someone else.
 */

const props = defineProps<{ project: ProjectView }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()

const { data: people } = await useAsyncData('projects-people', () =>
  useApiFetch<ProjectPerson[]>('/api/tools/projects/people')
)

const form = reactive({
  name: '',
  targetDate: '',
  products: '',
  notes: '',
  ownerId: '',
  memberIds: [] as string[]
})
const saving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  const p = props.project
  form.name = p.name
  form.targetDate = p.targetDate ?? ''
  form.products = p.products ?? ''
  form.notes = p.notes ?? ''
  form.ownerId = p.ownerId
  form.memberIds = p.members.map(m => m.id).filter(id => id !== p.ownerId)
}, { immediate: true })

// People who can be picked: everyone with access, plus anyone already in the project.
const everyone = computed(() => {
  const known = new Map((people.value ?? []).map(p => [p.id, p.name]))
  for (const m of props.project.members) known.set(m.id, m.name)
  return [...known].map(([value, label]) => ({ label, value }))
})
const memberItems = computed(() => everyone.value.filter(p => p.value !== form.ownerId))

async function save() {
  if (!form.name.trim()) return toast.add({ title: 'The project needs a name', color: 'warning' })
  if (form.targetDate && form.targetDate < props.project.startDate) {
    return toast.add({ title: 'The target date can\'t be before the start date', color: 'warning' })
  }
  saving.value = true
  try {
    await useApiFetch(`/api/tools/projects/${props.project.id}`, {
      method: 'PUT',
      body: {
        name: form.name,
        targetDate: form.targetDate || null,
        products: form.products.trim() || null,
        notes: form.notes.trim() || null,
        ownerId: form.ownerId
      }
    })
    await useApiFetch(`/api/tools/projects/${props.project.id}/members`, {
      method: 'PUT',
      body: { memberIds: form.memberIds.filter(id => id !== form.ownerId) }
    })
    open.value = false
    emit('saved')
    toast.add({ title: 'Project saved', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Couldn\'t save the project', description: errorText(err), color: 'error' })
    emit('saved')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Project settings"
  >
    <template #body>
      <form
        class="space-y-4"
        @submit.prevent="save"
      >
        <UFormField
          label="Project name"
          required
        >
          <UInput
            v-model="form.name"
            :maxlength="PROJECT_NAME_MAX"
            class="w-full"
            data-testid="settings-name"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="Owner"
            help="Can change these settings and close the project."
          >
            <USelectMenu
              v-model="form.ownerId"
              :items="everyone"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Target date"
            help="Only used to flag the project as at risk."
          >
            <UInput
              v-model="form.targetDate"
              type="date"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          label="Members"
          help="Who can see this project. Remove someone only after their unfinished tasks are given to others."
        >
          <USelectMenu
            v-model="form.memberIds"
            :items="memberItems"
            value-key="value"
            multiple
            placeholder="Add people"
            class="w-full"
            data-testid="settings-members"
          />
        </UFormField>

        <UFormField label="Products (optional)">
          <UInput
            v-model="form.products"
            :maxlength="PROJECT_TEXT_MAX"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Notes (optional)">
          <UTextarea
            v-model="form.notes"
            :rows="2"
            autoresize
            :maxlength="PROJECT_TEXT_MAX"
            class="w-full"
          />
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          variant="outline"
          color="neutral"
          label="Cancel"
          @click="open = false"
        />
        <UButton
          label="Save"
          :loading="saving"
          data-testid="settings-save"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
