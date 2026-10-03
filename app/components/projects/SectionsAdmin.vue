<script setup lang="ts">
import type { ProjectSectionItem } from '~~/shared/types/projects'
import { PROJECT_NAME_MAX } from '~~/shared/utils/projectRules'

/**
 * Sections (Step 16.5b, admins only): the groups tasks sit in, like Marketing,
 * Quality and Purchasing. One ordered list for every project type; the order
 * here is the order tasks are grouped in. Sections are never deleted:
 * switching one off hides it from the task picker, and running projects keep
 * the section name they started with.
 */

const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const { data, error, refresh } = await useAsyncData('projects-sections-admin', () =>
  useApiFetch<ProjectSectionItem[]>('/api/tools/projects/sections')
)

const newName = ref('')
const adding = ref(false)
const editingId = ref<number | null>(null)
const editName = ref('')
const busyId = ref<number | null>(null)

async function add() {
  const name = newName.value.trim()
  if (!name) {
    toast.add({ title: 'Enter a name first', color: 'warning' })
    return
  }
  adding.value = true
  try {
    await useApiFetch('/api/tools/projects/sections', { method: 'POST', body: { name } })
    newName.value = ''
    await refresh()
    emit('changed')
    toast.add({ title: `Added ${name}`, description: 'Pick it on the tasks in the Task list tab.', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Couldn\'t add it', description: errorText(err), color: 'error' })
  } finally {
    adding.value = false
  }
}

function startEdit(s: ProjectSectionItem) {
  editingId.value = s.id
  editName.value = s.name
}

async function save(s: ProjectSectionItem, changes: { name?: string, active?: boolean }) {
  busyId.value = s.id
  try {
    await useApiFetch(`/api/tools/projects/sections/${s.id}`, {
      method: 'PUT',
      body: { name: changes.name ?? s.name, active: changes.active ?? s.active }
    })
    editingId.value = null
    await refresh()
    emit('changed')
  } catch (err) {
    toast.add({ title: 'Couldn\'t save the change', description: errorText(err), color: 'error' })
  } finally {
    busyId.value = null
  }
}

async function move(index: number, by: -1 | 1) {
  const list = [...(data.value ?? [])]
  const target = index + by
  if (target < 0 || target >= list.length) return
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item!)
  busyId.value = item!.id
  try {
    await useApiFetch('/api/tools/projects/sections/order', { method: 'PUT', body: { ids: list.map(s => s.id) } })
    await refresh()
    emit('changed')
  } catch (err) {
    toast.add({ title: 'Couldn\'t change the order', description: errorText(err), color: 'error' })
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load sections"
      :description="errorText(error)"
    />

    <template v-else>
      <UCard>
        <form
          class="flex flex-col gap-3 sm:flex-row sm:items-end"
          @submit.prevent="add"
        >
          <UFormField
            label="New section"
            class="flex-1"
          >
            <UInput
              v-model="newName"
              :maxlength="PROJECT_NAME_MAX"
              placeholder="e.g. Marketing"
              class="w-full"
              data-testid="section-name"
            />
          </UFormField>
          <UButton
            type="submit"
            icon="i-lucide-plus"
            label="Add"
            :loading="adding"
          />
        </form>
      </UCard>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <p
          v-if="!data?.length"
          class="p-4 text-sm text-muted"
        >
          No sections yet. Add ones like Marketing, Quality and Purchasing to group your tasks.
        </p>

        <ul v-else>
          <li
            v-for="(s, index) in data"
            :key="s.id"
            class="flex flex-wrap items-center gap-2 border-t border-default px-4 py-3 first:border-t-0"
            :data-testid="`section-${s.id}`"
          >
            <template v-if="editingId === s.id">
              <UInput
                v-model="editName"
                autofocus
                :maxlength="PROJECT_NAME_MAX"
                class="min-w-0 flex-1"
                aria-label="Name"
                @keydown.enter.prevent="save(s, { name: editName })"
              />
              <UButton
                size="sm"
                label="Save"
                :loading="busyId === s.id"
                @click="save(s, { name: editName })"
              />
              <UButton
                size="sm"
                variant="ghost"
                color="neutral"
                label="Cancel"
                @click="editingId = null"
              />
            </template>
            <template v-else>
              <span
                class="min-w-0 flex-1 break-words"
                :class="s.active ? '' : 'text-muted line-through'"
              >{{ s.name }}</span>
              <UBadge
                v-if="!s.active"
                color="neutral"
                variant="subtle"
                label="Switched off"
              />
              <UButton
                size="sm"
                variant="ghost"
                color="neutral"
                icon="i-lucide-arrow-up"
                aria-label="Move section up"
                :disabled="index === 0 || busyId !== null"
                @click="move(index, -1)"
              />
              <UButton
                size="sm"
                variant="ghost"
                color="neutral"
                icon="i-lucide-arrow-down"
                aria-label="Move section down"
                :disabled="index === data.length - 1 || busyId !== null"
                @click="move(index, 1)"
              />
              <UButton
                size="sm"
                variant="ghost"
                color="neutral"
                icon="i-lucide-pencil"
                label="Rename"
                @click="startEdit(s)"
              />
              <UButton
                size="sm"
                variant="outline"
                color="neutral"
                :label="s.active ? 'Switch off' : 'Switch on'"
                :loading="busyId === s.id"
                @click="save(s, { active: !s.active })"
              />
            </template>
          </li>
        </ul>
      </UCard>

      <p class="text-sm text-muted">
        Tasks are grouped in this order, with tasks that have no section last. Switching a section off hides it from the task picker;
        tasks already in it stay there. Projects already started keep the section names they started with.
      </p>
    </template>
  </div>
</template>
