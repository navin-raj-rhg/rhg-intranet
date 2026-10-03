<script setup lang="ts">
import type { PimCategoryItem } from '~~/shared/types/pim'
import { PIM_REQUIRABLE_FIELDS, PIM_SHORT_TEXT_MAX } from '~~/shared/utils/pimRules'

/** One category on the setup tab: rename / switch off / delete, sub-categories, required fields, attributes. */

const props = defineProps<{ category: PimCategoryItem }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const busy = ref(false)

async function run(action: () => Promise<unknown>, failTitle: string): Promise<boolean> {
  busy.value = true
  try {
    await action()
    emit('changed')
    return true
  } catch (err) {
    toast.add({ title: failTitle, description: errorText(err), color: 'error' })
    return false
  } finally {
    busy.value = false
  }
}

/* --- Rename and switch on / off (the category or a sub-category) --- */

const editingId = ref<number | null>(null)
const editName = ref('')

function startEdit(id: number, name: string) {
  editingId.value = id
  editName.value = name
}

async function saveCategory(id: number, changes: { name: string, active: boolean }, requiredFields?: string[]) {
  const ok = await run(
    () => useApiFetch(`/api/tools/pim/categories/${id}`, { method: 'PUT', body: { ...changes, ...(requiredFields ? { requiredFields } : {}) } }),
    'Couldn\'t save the change'
  )
  if (ok) editingId.value = null
  return ok
}

/* --- Sub-categories --- */

const newSub = ref('')

async function addSub() {
  const name = newSub.value.trim()
  if (!name) return
  const ok = await run(
    () => useApiFetch('/api/tools/pim/categories', { method: 'POST', body: { name, parentId: props.category.id } }),
    'Couldn\'t add the sub-category'
  )
  if (ok) newSub.value = ''
}

/* --- Required fields --- */

const requiredFieldItems = Object.entries(PIM_REQUIRABLE_FIELDS).map(([value, label]) => ({ value, label }))
const required = ref<string[]>([...props.category.requiredFields])
watch(() => props.category.requiredFields, (v) => {
  required.value = [...v]
})
const requiredChanged = computed(() =>
  [...required.value].sort().join('|') !== [...props.category.requiredFields].sort().join('|')
)

async function saveRequired() {
  const ok = await saveCategory(props.category.id, { name: props.category.name, active: props.category.active }, required.value)
  if (ok) toast.add({ title: 'Required fields saved', color: 'success' })
}

function toggleRequired(field: string, on: boolean | 'indeterminate') {
  required.value = on === true ? [...new Set([...required.value, field])] : required.value.filter(f => f !== field)
}

/* --- Delete (a category or a sub-category nothing uses) --- */

const confirm = reactive({ open: false, id: 0, name: '', isSub: false })

function askDelete(id: number, name: string, isSub: boolean) {
  Object.assign(confirm, { open: true, id, name, isSub })
}

async function doDelete() {
  const ok = await run(() => useApiFetch(`/api/tools/pim/categories/${confirm.id}`, { method: 'DELETE' }), 'Couldn\'t delete it')
  if (ok) {
    confirm.open = false
    toast.add({ title: `Deleted ${confirm.name}`, color: 'success' })
  }
}
</script>

<template>
  <UCard :data-testid="`category-${category.id}`">
    <template #header>
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="editingId === category.id">
          <UInput
            v-model="editName"
            autofocus
            :maxlength="PIM_SHORT_TEXT_MAX"
            class="min-w-0 flex-1"
            aria-label="Category name"
            @keydown.enter.prevent="saveCategory(category.id, { name: editName, active: category.active })"
          />
          <UButton
            size="sm"
            label="Save"
            :loading="busy"
            @click="saveCategory(category.id, { name: editName, active: category.active })"
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
          <h3
            class="min-w-0 flex-1 break-words text-base font-semibold"
            :class="category.active ? '' : 'text-muted line-through'"
          >
            {{ category.name }}
          </h3>
          <UBadge
            color="neutral"
            variant="subtle"
            :label="`${category.productCount} product${category.productCount === 1 ? '' : 's'}`"
          />
          <UBadge
            v-if="!category.active"
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
            @click="startEdit(category.id, category.name)"
          />
          <UButton
            size="sm"
            variant="outline"
            color="neutral"
            :label="category.active ? 'Switch off' : 'Switch on'"
            :loading="busy"
            @click="saveCategory(category.id, { name: category.name, active: !category.active })"
          />
          <UButton
            size="sm"
            variant="ghost"
            color="error"
            icon="i-lucide-trash-2"
            label="Delete"
            :disabled="category.productCount > 0"
            :title="category.productCount > 0 ? 'Products use this category - switch it off instead' : undefined"
            @click="askDelete(category.id, category.name, false)"
          />
        </template>
      </div>
    </template>

    <div class="space-y-6">
      <!-- Sub-categories -->
      <section class="space-y-2">
        <h4 class="text-sm font-medium">
          Sub-categories
        </h4>
        <p
          v-if="!category.subCategories.length"
          class="text-sm text-muted"
        >
          None yet (optional).
        </p>
        <ul v-else>
          <li
            v-for="s in category.subCategories"
            :key="s.id"
            class="flex flex-wrap items-center gap-2 border-t border-default py-2 first:border-t-0"
          >
            <template v-if="editingId === s.id">
              <UInput
                v-model="editName"
                autofocus
                :maxlength="PIM_SHORT_TEXT_MAX"
                class="min-w-0 flex-1"
                aria-label="Sub-category name"
                @keydown.enter.prevent="saveCategory(s.id, { name: editName, active: s.active })"
              />
              <UButton
                size="sm"
                label="Save"
                :loading="busy"
                @click="saveCategory(s.id, { name: editName, active: s.active })"
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
                class="min-w-0 flex-1 break-words text-sm"
                :class="s.active ? '' : 'text-muted line-through'"
              >{{ s.name }}</span>
              <UBadge
                v-if="!s.active"
                color="neutral"
                variant="subtle"
                label="Switched off"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-pencil"
                label="Rename"
                @click="startEdit(s.id, s.name)"
              />
              <UButton
                size="xs"
                variant="outline"
                color="neutral"
                :label="s.active ? 'Switch off' : 'Switch on'"
                :loading="busy"
                @click="saveCategory(s.id, { name: s.name, active: !s.active })"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                label="Delete"
                @click="askDelete(s.id, s.name, true)"
              />
            </template>
          </li>
        </ul>
        <form
          class="flex gap-2"
          @submit.prevent="addSub"
        >
          <UInput
            v-model="newSub"
            :maxlength="PIM_SHORT_TEXT_MAX"
            placeholder="New sub-category"
            class="min-w-0 flex-1"
            aria-label="New sub-category"
          />
          <UButton
            type="submit"
            size="sm"
            variant="outline"
            icon="i-lucide-plus"
            label="Add"
            :loading="busy"
          />
        </form>
      </section>

      <!-- Required fields -->
      <section class="space-y-2">
        <h4 class="text-sm font-medium">
          Needed for a complete product
        </h4>
        <p class="text-sm text-muted">
          Each ticked field counts towards the "complete" percentage of this category's products. Required attributes (below) count too.
        </p>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <UCheckbox
            v-for="f in requiredFieldItems"
            :key="f.value"
            :model-value="required.includes(f.value)"
            :label="f.label"
            @update:model-value="toggleRequired(f.value, $event)"
          />
        </div>
        <UButton
          v-if="requiredChanged"
          size="sm"
          label="Save required fields"
          :loading="busy"
          @click="saveRequired"
        />
      </section>

      <!-- Attributes -->
      <section class="space-y-2">
        <h4 class="text-sm font-medium">
          Attributes
        </h4>
        <PimAttributeList
          :category="category"
          @changed="emit('changed')"
        />
      </section>
    </div>

    <UModal
      v-model:open="confirm.open"
      :title="`Delete ${confirm.isSub ? 'sub-category' : 'category'} ${confirm.name}?`"
    >
      <template #body>
        <p class="text-sm">
          {{ confirm.isSub ? '' : 'Its sub-categories and attributes are deleted too. ' }}This can't be undone. A category that products use can't be deleted - switch it off instead.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Keep it"
            color="neutral"
            variant="outline"
            :disabled="busy"
            @click="confirm.open = false"
          />
          <UButton
            label="Delete"
            color="error"
            icon="i-lucide-trash-2"
            :loading="busy"
            @click="doDelete"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
