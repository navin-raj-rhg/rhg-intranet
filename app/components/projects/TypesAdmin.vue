<script setup lang="ts">
import type { ProjectTypeItem } from '~~/shared/types/projects'
import { PROJECT_NAME_MAX } from '~~/shared/utils/projectRules'

/**
 * Project types (Step 16.5, admins only): Live launch, Promo launch, CSO launch
 * and any others. Which tasks each type includes is set on the Task list tab.
 * Types are never deleted: switching one off hides it from new projects, and
 * running projects keep the name they started with.
 */

const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const { data, error, refresh } = await useAsyncData('projects-types-admin', () =>
  useApiFetch<ProjectTypeItem[]>('/api/tools/projects/types')
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
    await useApiFetch('/api/tools/projects/types', { method: 'POST', body: { name } })
    newName.value = ''
    await refresh()
    emit('changed')
    toast.add({ title: `Added ${name}`, description: 'Tick it on the tasks it applies to in the Task list tab.', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Couldn\'t add it', description: errorText(err), color: 'error' })
  } finally {
    adding.value = false
  }
}

function startEdit(t: ProjectTypeItem) {
  editingId.value = t.id
  editName.value = t.name
}

async function save(t: ProjectTypeItem, changes: { name?: string, active?: boolean }) {
  busyId.value = t.id
  try {
    await useApiFetch(`/api/tools/projects/types/${t.id}`, {
      method: 'PUT',
      body: { name: changes.name ?? t.name, active: changes.active ?? t.active }
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
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load project types"
      :description="errorText(error)"
    />

    <template v-else>
      <UCard>
        <form
          class="flex flex-col gap-3 sm:flex-row sm:items-end"
          @submit.prevent="add"
        >
          <UFormField
            label="New project type"
            class="flex-1"
          >
            <UInput
              v-model="newName"
              :maxlength="PROJECT_NAME_MAX"
              placeholder="e.g. Supplier onboarding"
              class="w-full"
              data-testid="type-name"
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
          No project types yet.
        </p>

        <ul v-else>
          <li
            v-for="t in data"
            :key="t.id"
            class="flex flex-wrap items-center gap-2 border-t border-default px-4 py-3 first:border-t-0"
            :data-testid="`type-${t.id}`"
          >
            <template v-if="editingId === t.id">
              <UInput
                v-model="editName"
                autofocus
                :maxlength="PROJECT_NAME_MAX"
                class="min-w-0 flex-1"
                aria-label="Name"
                @keydown.enter.prevent="save(t, { name: editName })"
              />
              <UButton
                size="sm"
                label="Save"
                :loading="busyId === t.id"
                @click="save(t, { name: editName })"
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
                :class="t.active ? '' : 'text-muted line-through'"
              >{{ t.name }}</span>
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
                icon="i-lucide-pencil"
                label="Rename"
                @click="startEdit(t)"
              />
              <UButton
                size="sm"
                variant="outline"
                color="neutral"
                :label="t.active ? 'Switch off' : 'Switch on'"
                :loading="busyId === t.id"
                @click="save(t, { active: !t.active })"
              />
            </template>
          </li>
        </ul>
      </UCard>

      <p class="text-sm text-muted">
        Switching a type off hides it from new projects. Projects already started keep the name and tasks they started with.
        A project can also be started with no type at all (a blank project) and have its tasks added by hand.
      </p>
    </template>
  </div>
</template>
