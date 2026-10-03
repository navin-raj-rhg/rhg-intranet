<script setup lang="ts">
import type { PimAttributeItem, PimCategoryItem } from '~~/shared/types/pim'
import {
  PIM_ATTRIBUTE_TYPES,
  PIM_ATTRIBUTE_TYPE_LABELS,
  PIM_SHORT_TEXT_MAX,
  pimAttributeDefProblem,
  type PimAttributeType
} from '~~/shared/utils/pimRules'

/** The extra fields (attributes) of one category: add, edit, switch off, delete. The type is fixed once created. */

const props = defineProps<{ category: PimCategoryItem }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const typeItems = PIM_ATTRIBUTE_TYPES.map(t => ({ value: t, label: PIM_ATTRIBUTE_TYPE_LABELS[t] }))

const busy = ref(false)
const dlg = reactive({
  open: false,
  id: null as number | null,
  name: '',
  type: 'text' as PimAttributeType,
  optionsText: '',
  required: false
})

function openAdd() {
  Object.assign(dlg, { open: true, id: null, name: '', type: 'text', optionsText: '', required: false })
}

function openEdit(a: PimAttributeItem) {
  Object.assign(dlg, { open: true, id: a.id, name: a.name, type: a.type, optionsText: (a.options ?? []).join('\n'), required: a.required })
}

const options = computed(() => dlg.optionsText.split('\n').map(o => o.trim()).filter(Boolean))
const problem = computed(() => pimAttributeDefProblem({ name: dlg.name, type: dlg.type, options: options.value }))

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

async function save() {
  if (problem.value) {
    toast.add({ title: problem.value, color: 'warning' })
    return
  }
  const body = { name: dlg.name, options: dlg.type === 'list' ? options.value : null, required: dlg.required }
  const ok = dlg.id === null
    ? await run(() => useApiFetch('/api/tools/pim/attributes', { method: 'POST', body: { ...body, categoryId: props.category.id, type: dlg.type } }), 'Couldn\'t add the attribute')
    : await run(() => useApiFetch(`/api/tools/pim/attributes/${dlg.id}`, {
        method: 'PUT',
        body: { ...body, active: props.category.attributes.find(a => a.id === dlg.id)?.active ?? true }
      }), 'Couldn\'t save the attribute')
  if (ok) dlg.open = false
}

function toggleActive(a: PimAttributeItem) {
  return run(() => useApiFetch(`/api/tools/pim/attributes/${a.id}`, {
    method: 'PUT',
    body: { name: a.name, options: a.options, required: a.required, active: !a.active }
  }), 'Couldn\'t save the change')
}

const confirm = reactive({ open: false, id: 0, name: '' })

async function doDelete() {
  const ok = await run(() => useApiFetch(`/api/tools/pim/attributes/${confirm.id}`, { method: 'DELETE' }), 'Couldn\'t delete it')
  if (ok) {
    confirm.open = false
    toast.add({ title: `Deleted ${confirm.name}`, color: 'success' })
  }
}
</script>

<template>
  <div class="space-y-2">
    <p
      v-if="!category.attributes.length"
      class="text-sm text-muted"
    >
      None yet. Attributes are extra fields for this category's products, such as Material or Colour.
    </p>

    <ul v-else>
      <li
        v-for="a in category.attributes"
        :key="a.id"
        class="flex flex-wrap items-center gap-2 border-t border-default py-2 first:border-t-0"
        :data-testid="`attribute-${a.id}`"
      >
        <div class="min-w-0 flex-1">
          <span
            class="break-words text-sm"
            :class="a.active ? '' : 'text-muted line-through'"
          >{{ a.name }}</span>
          <p
            v-if="a.type === 'list' && a.options?.length"
            class="break-words text-xs text-muted"
          >
            {{ a.options.join(', ') }}
          </p>
        </div>
        <UBadge
          color="neutral"
          variant="outline"
          :label="PIM_ATTRIBUTE_TYPE_LABELS[a.type]"
        />
        <UBadge
          v-if="a.required"
          color="primary"
          variant="subtle"
          label="Required"
        />
        <UBadge
          v-if="!a.active"
          color="neutral"
          variant="subtle"
          label="Switched off"
        />
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-pencil"
          label="Edit"
          @click="openEdit(a)"
        />
        <UButton
          size="xs"
          variant="outline"
          color="neutral"
          :label="a.active ? 'Switch off' : 'Switch on'"
          :loading="busy"
          @click="toggleActive(a)"
        />
        <UButton
          size="xs"
          variant="ghost"
          color="error"
          icon="i-lucide-trash-2"
          label="Delete"
          @click="Object.assign(confirm, { open: true, id: a.id, name: a.name })"
        />
      </li>
    </ul>

    <UButton
      size="sm"
      variant="outline"
      icon="i-lucide-plus"
      label="Add attribute"
      @click="openAdd"
    />

    <UModal
      v-model:open="dlg.open"
      :title="dlg.id === null ? `New attribute for ${category.name}` : 'Edit attribute'"
    >
      <template #body>
        <form
          :id="`attribute-form-${category.id}`"
          class="space-y-4"
          @submit.prevent="save"
        >
          <UFormField label="Name">
            <UInput
              v-model="dlg.name"
              :maxlength="PIM_SHORT_TEXT_MAX"
              placeholder="e.g. Material"
              class="w-full"
              autofocus
            />
          </UFormField>
          <UFormField
            label="Type"
            :help="dlg.id === null ? undefined : 'The type can\'t be changed once the attribute exists.'"
          >
            <USelect
              v-model="dlg.type"
              :items="typeItems"
              :disabled="dlg.id !== null"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="dlg.type === 'list'"
            label="Choices"
            help="One choice per line (at least two)."
          >
            <UTextarea
              v-model="dlg.optionsText"
              :rows="5"
              class="w-full"
            />
          </UFormField>
          <UCheckbox
            v-model="dlg.required"
            label="Needed for a complete product"
          />
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :disabled="busy"
            @click="dlg.open = false"
          />
          <UButton
            type="submit"
            :form="`attribute-form-${category.id}`"
            :label="dlg.id === null ? 'Add attribute' : 'Save'"
            :loading="busy"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="confirm.open"
      :title="`Delete attribute ${confirm.name}?`"
    >
      <template #body>
        <p class="text-sm">
          This can't be undone. An attribute that products have a value for can't be deleted - switch it off instead.
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
  </div>
</template>
