<script setup lang="ts">
import type { InspectionLocationItem } from '~~/shared/types/inspection'
import { INSPECTION_NAME_MAX, type InspectionLocationType } from '~~/shared/utils/inspectionRules'

/**
 * Supplier and DC list (Step 12.7, admins only). Inspectors pick from the
 * active entries when they start a report. Entries are never deleted: switching
 * one off hides it from new reports, and old reports keep the name they had.
 */

const toast = useToast()

const { data, error, refresh } = await useAsyncData('inspection-locations-admin', () =>
  useApiFetch<InspectionLocationItem[]>('/api/tools/inspection-reporting/locations')
)

const typeItems = [
  { label: 'Supplier', value: 'supplier' },
  { label: 'DC', value: 'dc' }
]

const newType = ref<InspectionLocationType>('supplier')
const newName = ref('')
const adding = ref(false)

const editingId = ref<number | null>(null)
const editName = ref('')
const busyId = ref<number | null>(null)

const suppliers = computed(() => (data.value ?? []).filter(l => l.type === 'supplier'))
const dcs = computed(() => (data.value ?? []).filter(l => l.type === 'dc'))

async function add() {
  const name = newName.value.trim()
  if (!name) {
    toast.add({ title: 'Enter a name first', color: 'warning' })
    return
  }
  adding.value = true
  try {
    await useApiFetch('/api/tools/inspection-reporting/locations', { method: 'POST', body: { type: newType.value, name } })
    newName.value = ''
    await refresh()
    toast.add({ title: `Added ${name}`, color: 'success' })
  } catch (err) {
    toast.add({ title: 'Couldn\'t add it', description: errorText(err), color: 'error' })
  } finally {
    adding.value = false
  }
}

function startEdit(l: InspectionLocationItem) {
  editingId.value = l.id
  editName.value = l.name
}

async function save(l: InspectionLocationItem, changes: { name?: string, active?: boolean }) {
  busyId.value = l.id
  try {
    await useApiFetch(`/api/tools/inspection-reporting/locations/${l.id}`, {
      method: 'PUT',
      body: { name: changes.name ?? l.name, active: changes.active ?? l.active }
    })
    editingId.value = null
    await refresh()
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
      title="Couldn't load suppliers and DCs"
      :description="errorText(error)"
    />

    <template v-else>
      <UCard>
        <form
          class="flex flex-col gap-3 sm:flex-row sm:items-end"
          @submit.prevent="add"
        >
          <UFormField label="Type">
            <USelect
              v-model="newType"
              :items="typeItems"
              class="w-full sm:w-36"
            />
          </UFormField>
          <UFormField
            label="Name"
            class="flex-1"
          >
            <UInput
              v-model="newName"
              :maxlength="INSPECTION_NAME_MAX"
              placeholder="Supplier name or DC location"
              class="w-full"
              data-testid="location-name"
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

      <div class="grid gap-6 md:grid-cols-2">
        <UCard
          v-for="group in [{ title: 'Suppliers', list: suppliers }, { title: 'DCs', list: dcs }]"
          :key="group.title"
          :ui="{ body: 'p-0 sm:p-0' }"
        >
          <template #header>
            <h3 class="font-semibold">
              {{ group.title }}
            </h3>
          </template>

          <p
            v-if="!group.list.length"
            class="p-4 text-sm text-muted"
          >
            None yet.
          </p>

          <ul v-else>
            <li
              v-for="l in group.list"
              :key="l.id"
              class="flex flex-wrap items-center gap-2 border-t border-default px-4 py-3 first:border-t-0"
              :data-testid="`location-${l.id}`"
            >
              <template v-if="editingId === l.id">
                <UInput
                  v-model="editName"
                  autofocus
                  :maxlength="INSPECTION_NAME_MAX"
                  class="min-w-0 flex-1"
                  aria-label="Name"
                  @keydown.enter.prevent="save(l, { name: editName })"
                />
                <UButton
                  size="sm"
                  label="Save"
                  :loading="busyId === l.id"
                  @click="save(l, { name: editName })"
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
                  :class="l.active ? '' : 'text-muted line-through'"
                >{{ l.name }}</span>
                <UBadge
                  v-if="!l.active"
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
                  @click="startEdit(l)"
                />
                <UButton
                  size="sm"
                  variant="outline"
                  color="neutral"
                  :label="l.active ? 'Switch off' : 'Switch on'"
                  :loading="busyId === l.id"
                  @click="save(l, { active: !l.active })"
                />
              </template>
            </li>
          </ul>
        </UCard>
      </div>

      <p class="text-sm text-muted">
        Switching an entry off hides it from new reports. Reports already made keep the name they were made with.
      </p>
    </template>
  </div>
</template>
