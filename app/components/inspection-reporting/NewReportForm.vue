<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui'
import type { InspectionLocationItem, InspectionMyRoleResponse, InspectionTemplateListItem } from '~~/shared/types/inspection'

/**
 * Start a new inspection (Step 12.8): pick the supplier or DC and the template,
 * add the optional details, then go straight to the checklist.
 */

const props = defineProps<{ role: InspectionMyRoleResponse }>()

const toast = useToast()

const [locationsReq, templatesReq] = await Promise.all([
  useAsyncData('inspection-new-locations', () => useApiFetch<InspectionLocationItem[]>('/api/tools/inspection-reporting/locations')),
  useAsyncData('inspection-new-templates', () => useApiFetch<InspectionTemplateListItem[]>('/api/tools/inspection-reporting/templates'))
])

const locations = computed(() => (locationsReq.data.value ?? []).filter(l => l.active))
const templates = computed(() => (templatesReq.data.value ?? []).filter(t => t.active))
const loadError = computed(() => locationsReq.error.value || templatesReq.error.value)

const locationItems = computed(() => {
  const group = (title: string, type: 'supplier' | 'dc'): SelectMenuItem[] => [
    { type: 'label', label: title },
    ...locations.value.filter(l => l.type === type).map(l => ({ label: l.name, value: l.id }))
  ]
  return [
    ...(locations.value.some(l => l.type === 'supplier') ? [group('Suppliers', 'supplier')] : []),
    ...(locations.value.some(l => l.type === 'dc') ? [group('DCs', 'dc')] : [])
  ]
})
const templateItems = computed(() => templates.value.map(t => ({ label: t.name, value: t.id })))

const locationId = ref<number | undefined>()
const templateId = ref<number | undefined>(undefined)
const productNo = ref('')
const reference = ref('')
const dateText = ref(formatDateMY(todayMY()))
const notes = ref('')
const saving = ref(false)

// A single template is the obvious choice, so pre-select it.
watch(templates, (list) => {
  if (list.length === 1 && templateId.value === undefined) templateId.value = list[0]!.id
}, { immediate: true })

async function start() {
  if (locationId.value === undefined) return toast.add({ title: 'Choose a supplier or DC', color: 'warning' })
  if (templateId.value === undefined) return toast.add({ title: 'Choose a report template', color: 'warning' })
  const iso = parseDateMY(dateText.value)
  if (!iso) return toast.add({ title: 'Enter the inspection date as dd/mm/yyyy', color: 'warning' })

  saving.value = true
  try {
    const { id } = await useApiFetch<{ id: number }>('/api/tools/inspection-reporting/reports', {
      method: 'POST',
      body: {
        locationId: locationId.value,
        templateId: templateId.value,
        productNo: productNo.value.trim() || null,
        reference: reference.value.trim() || null,
        inspectionDate: iso,
        notes: notes.value.trim() || null
      }
    })
    await navigateTo(`/tools/inspection-reporting/${id}`)
  } catch (err) {
    toast.add({ title: 'Couldn\'t start the inspection', description: errorText(err), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UAlert
    v-if="!props.role.canCreate"
    color="error"
    variant="subtle"
    title="Inspector access required"
    description="You need the Inspector role to start an inspection - ask the workspace owner."
  />

  <UAlert
    v-else-if="loadError"
    color="error"
    variant="subtle"
    title="Couldn't load the lists"
    :description="errorText(loadError)"
  />

  <UAlert
    v-else-if="!locationItems.length || !templateItems.length"
    color="warning"
    variant="subtle"
    title="Not ready to start an inspection yet"
  >
    <template #description>
      <template v-if="!locationItems.length">
        There are no suppliers or DCs in the list.
      </template>
      <template v-if="!templateItems.length">
        There are no report templates available.
      </template>
      An Inspection Reporting admin needs to add them first (Suppliers &amp; DCs and Templates tabs).
    </template>
  </UAlert>

  <form
    v-else
    class="space-y-4"
    @submit.prevent="start"
  >
    <UCard>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Supplier or DC"
          required
        >
          <USelectMenu
            v-model="locationId"
            :items="locationItems"
            value-key="value"
            placeholder="Choose…"
            class="w-full"
            data-testid="new-location"
          />
        </UFormField>
        <UFormField
          label="Report template"
          required
        >
          <USelect
            v-model="templateId"
            :items="templateItems"
            placeholder="Choose…"
            class="w-full"
            data-testid="new-template"
          />
        </UFormField>
        <UFormField label="Product number">
          <UInput
            v-model="productNo"
            maxlength="100"
            class="w-full"
            data-testid="new-product"
          />
        </UFormField>
        <UFormField label="PO / reference">
          <UInput
            v-model="reference"
            maxlength="100"
            class="w-full"
            data-testid="new-reference"
          />
        </UFormField>
        <UFormField
          label="Inspection date"
          required
        >
          <UInput
            v-model="dateText"
            placeholder="dd/mm/yyyy"
            inputmode="numeric"
            class="w-full"
            data-testid="new-date"
          />
        </UFormField>
      </div>
      <UFormField
        label="Notes"
        class="mt-4"
      >
        <UTextarea
          v-model="notes"
          :rows="2"
          autoresize
          maxlength="4000"
          class="w-full"
        />
      </UFormField>
    </UCard>

    <div class="flex flex-wrap gap-3">
      <UButton
        type="submit"
        icon="i-lucide-clipboard-list"
        label="Start inspection"
        :loading="saving"
        data-testid="start-inspection"
      />
      <UButton
        to="/tools/inspection-reporting"
        variant="ghost"
        color="neutral"
        label="Cancel"
      />
    </div>
  </form>
</template>
