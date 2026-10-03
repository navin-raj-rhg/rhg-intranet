<script setup lang="ts">
import type { PimCategoryItem, PimPackagingLevelKey, PimProductView } from '~~/shared/types/pim'
import {
  PIM_LONG_DESC_MAX,
  PIM_MAX_SUPPLIERS,
  PIM_NAME_MAX,
  PIM_PRODUCT_NO_MAX,
  PIM_SHORT_DESC_MAX,
  PIM_SHORT_TEXT_MAX,
  PIM_STATUSES,
  PIM_STATUS_LABELS,
  checkPimAttributeValue,
  pimBarcodeProblem,
  pimMeasureProblem,
  pimMoneyProblem,
  pimNameProblem,
  pimProductNoProblem,
  pimQuantityProblem,
  pimSuppliersProblem
} from '~~/shared/utils/pimRules'

/**
 * The product form (Step 17.6), used to create a product and (17.7) to edit one.
 * It checks the same rules the server does, so problems are caught before saving.
 * Files (images, documents) are added on the product page after it exists.
 */

const props = defineProps<{
  /** Set when editing; leave out for a new product. */
  product?: PimProductView
  categories: PimCategoryItem[]
  saving?: boolean
  submitLabel?: string
}>()
const emit = defineEmits<{ save: [body: Record<string, unknown>], cancel: [] }>()
const toast = useToast()

const NONE = 0
const LEVELS: { key: PimPackagingLevelKey, label: string, help: string }[] = [
  { key: 'carton', label: 'Carton', help: 'The inner pack a customer may buy.' },
  { key: 'outer', label: 'Outer', help: 'The shipping carton.' },
  { key: 'pallet', label: 'Pallet', help: 'The full pallet. Quantity = what is directly on it (e.g. outers).' }
]

type PackText = { lengthCm: string, widthCm: string, heightCm: string, weightKg: string, qtyInside: string }
const blankPack = (): PackText => ({ lengthCm: '', widthCm: '', heightCm: '', weightKg: '', qtyInside: '' })
const text = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v))

const p = props.product
const form = reactive({
  productNo: p?.productNo ?? '',
  name: p?.name ?? '',
  status: p?.status ?? 'draft',
  brand: p?.brand ?? '',
  categoryId: p?.categoryId ?? NONE,
  subCategoryId: p?.subCategoryId ?? NONE,
  shortDescription: p?.shortDescription ?? '',
  longDescription: p?.longDescription ?? '',
  barcode: p?.barcode ?? '',
  rrp: p?.rrp === null || p?.rrp === undefined ? '' : String(Number(p.rrp)),
  suppliers: (p?.suppliers ?? []).map(s => ({ name: s.name, supplierCode: s.supplierCode ?? '', isPrimary: s.isPrimary })),
  packaging: Object.fromEntries(LEVELS.map((l) => {
    const saved = p?.packaging.find(x => x.level === l.key)
    return [l.key, saved
      ? { lengthCm: text(saved.lengthCm && Number(saved.lengthCm)), widthCm: text(saved.widthCm && Number(saved.widthCm)), heightCm: text(saved.heightCm && Number(saved.heightCm)), weightKg: text(saved.weightKg && Number(saved.weightKg)), qtyInside: text(saved.qtyInside) }
      : blankPack()]
  })) as Record<PimPackagingLevelKey, PackText>,
  attributes: Object.fromEntries(Object.entries(p?.attributeValues ?? {}).map(([id, v]) => [id, v])) as Record<string, string>
})
if (!form.suppliers.length) form.suppliers.push({ name: '', supplierCode: '', isPrimary: true })

const statusItems = PIM_STATUSES.map(s => ({ value: s, label: PIM_STATUS_LABELS[s] }))

// A switched-off category stays selectable only if this product already uses it.
const categoryItems = computed(() => [
  { value: NONE, label: 'No category' },
  ...props.categories
    .filter(c => c.active || c.id === props.product?.categoryId)
    .map(c => ({ value: c.id, label: c.active ? c.name : `${c.name} (switched off)` }))
])
const chosenCategory = computed(() => props.categories.find(c => c.id === form.categoryId))
const subCategoryItems = computed(() => [
  { value: NONE, label: 'No sub-category' },
  ...(chosenCategory.value?.subCategories ?? [])
    .filter(s => s.active || s.id === props.product?.subCategoryId)
    .map(s => ({ value: s.id, label: s.active ? s.name : `${s.name} (switched off)` }))
])
watch(() => form.categoryId, () => {
  if (!subCategoryItems.value.some(s => s.value === form.subCategoryId)) form.subCategoryId = NONE
})

// Extra fields of the chosen category (switched-off ones only if they already have a value).
const attributes = computed(() =>
  (chosenCategory.value?.attributes ?? []).filter(a => a.active || form.attributes[a.id])
)
const UNSET = '__unset'
const choiceItems = (options: string[] | null) => [{ value: UNSET, label: '— not set —' }, ...(options ?? []).map(o => ({ value: o, label: o }))]
const yesNoItems = [{ value: UNSET, label: '— not set —' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]

function setAttribute(id: number, value: string | undefined) {
  form.attributes[String(id)] = value === UNSET || value === undefined ? '' : value
}

function addSupplier() {
  if (form.suppliers.length < PIM_MAX_SUPPLIERS) form.suppliers.push({ name: '', supplierCode: '', isPrimary: false })
}

function removeSupplier(i: number) {
  const wasPrimary = form.suppliers[i]?.isPrimary
  form.suppliers.splice(i, 1)
  if (!form.suppliers.length) form.suppliers.push({ name: '', supplierCode: '', isPrimary: true })
  else if (wasPrimary) form.suppliers[0]!.isPrimary = true
}

function makePrimary(i: number) {
  form.suppliers.forEach((s, idx) => {
    s.isPrimary = idx === i
  })
}

/** First thing wrong with the form, in plain English, or ''. */
function firstProblem(): string {
  const checks = [
    pimProductNoProblem(form.productNo),
    pimNameProblem(form.name),
    form.shortDescription.length > PIM_SHORT_DESC_MAX ? `Short description must be ${PIM_SHORT_DESC_MAX} characters or fewer` : '',
    form.longDescription.length > PIM_LONG_DESC_MAX ? `Long description must be ${PIM_LONG_DESC_MAX} characters or fewer` : '',
    form.brand.length > PIM_SHORT_TEXT_MAX ? `Brand must be ${PIM_SHORT_TEXT_MAX} characters or fewer` : '',
    pimBarcodeProblem(form.barcode),
    pimMoneyProblem(form.rrp, 'RRP'),
    pimSuppliersProblem(form.suppliers)
  ]
  for (const l of LEVELS) {
    const pk = form.packaging[l.key]
    checks.push(
      pimMeasureProblem(pk.lengthCm, `${l.label} length`),
      pimMeasureProblem(pk.widthCm, `${l.label} width`),
      pimMeasureProblem(pk.heightCm, `${l.label} height`),
      pimMeasureProblem(pk.weightKg, `${l.label} weight`),
      pimQuantityProblem(pk.qtyInside, `${l.label} quantity`)
    )
  }
  for (const a of attributes.value) checks.push(checkPimAttributeValue(a, form.attributes[a.id]).problem)
  return checks.find(c => c) ?? ''
}

const orNull = (s: string) => (s.trim() === '' ? null : s.trim())

function submit() {
  const problem = firstProblem()
  if (problem) {
    toast.add({ title: problem, color: 'warning' })
    return
  }
  emit('save', {
    productNo: form.productNo,
    name: form.name,
    status: form.status,
    brand: orNull(form.brand),
    categoryId: form.categoryId === NONE ? null : form.categoryId,
    subCategoryId: form.categoryId === NONE || form.subCategoryId === NONE ? null : form.subCategoryId,
    shortDescription: orNull(form.shortDescription),
    longDescription: orNull(form.longDescription),
    barcode: orNull(form.barcode),
    rrp: orNull(form.rrp),
    suppliers: form.suppliers.filter(s => s.name.trim()).map(s => ({ name: s.name, supplierCode: orNull(s.supplierCode), isPrimary: s.isPrimary })),
    packaging: Object.fromEntries(LEVELS.map((l) => {
      const pk = form.packaging[l.key]
      return [l.key, {
        lengthCm: orNull(pk.lengthCm),
        widthCm: orNull(pk.widthCm),
        heightCm: orNull(pk.heightCm),
        weightKg: orNull(pk.weightKg),
        qtyInside: orNull(pk.qtyInside)
      }]
    })),
    attributes: Object.fromEntries(attributes.value.map(a => [String(a.id), orNull(form.attributes[a.id] ?? '')]))
  })
}
</script>

<template>
  <form
    class="space-y-6"
    @submit.prevent="submit"
  >
    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Details
        </h2>
      </template>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Product number"
          required
          help="Unique across RHG (capital and small letters count as the same)."
        >
          <UInput
            v-model="form.productNo"
            :maxlength="PIM_PRODUCT_NO_MAX"
            class="w-full"
            data-testid="product-no"
          />
        </UFormField>
        <UFormField label="Status">
          <USelect
            v-model="form.status"
            :items="statusItems"
            class="w-full"
            data-testid="product-status"
          />
        </UFormField>
        <UFormField
          label="Name"
          required
          class="sm:col-span-2"
        >
          <UInput
            v-model="form.name"
            :maxlength="PIM_NAME_MAX"
            class="w-full"
            data-testid="product-name"
          />
        </UFormField>
        <UFormField label="Brand">
          <UInput
            v-model="form.brand"
            :maxlength="PIM_SHORT_TEXT_MAX"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Barcode (GTIN)"
          help="8, 12, 13 or 14 digits, including the check digit."
        >
          <UInput
            v-model="form.barcode"
            inputmode="numeric"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Category">
          <USelect
            v-model="form.categoryId"
            :items="categoryItems"
            class="w-full"
            data-testid="product-category"
          />
        </UFormField>
        <UFormField label="Sub-category">
          <USelect
            v-model="form.subCategoryId"
            :items="subCategoryItems"
            :disabled="form.categoryId === NONE"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="RRP (AUD)"
          help="Recommended retail price, up to 2 decimals."
        >
          <UInput
            v-model="form.rrp"
            inputmode="decimal"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Short description"
          class="sm:col-span-2"
          :help="`${form.shortDescription.length} / ${PIM_SHORT_DESC_MAX}`"
        >
          <UTextarea
            v-model="form.shortDescription"
            :rows="2"
            :maxlength="PIM_SHORT_DESC_MAX"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Long description"
          class="sm:col-span-2"
        >
          <UTextarea
            v-model="form.longDescription"
            :rows="6"
            :maxlength="PIM_LONG_DESC_MAX"
            class="w-full"
          />
        </UFormField>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Suppliers
        </h2>
      </template>
      <div class="space-y-3">
        <div
          v-for="(s, i) in form.suppliers"
          :key="i"
          class="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center"
          :data-testid="`supplier-row-${i}`"
        >
          <UInput
            v-model="s.name"
            :maxlength="PIM_SHORT_TEXT_MAX"
            placeholder="Supplier name"
            aria-label="Supplier name"
            class="w-full"
          />
          <UInput
            v-model="s.supplierCode"
            :maxlength="PIM_SHORT_TEXT_MAX"
            placeholder="Their code for it (optional)"
            aria-label="Supplier's code"
            class="w-full"
          />
          <UCheckbox
            :model-value="s.isPrimary"
            label="Primary"
            @update:model-value="makePrimary(i)"
          />
          <UButton
            size="sm"
            variant="ghost"
            color="error"
            icon="i-lucide-x"
            aria-label="Remove supplier"
            @click="removeSupplier(i)"
          />
        </div>
        <UButton
          v-if="form.suppliers.length < PIM_MAX_SUPPLIERS"
          size="sm"
          variant="outline"
          icon="i-lucide-plus"
          label="Add another supplier"
          @click="addSupplier"
        />
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Packaging and logistics
        </h2>
      </template>
      <div class="space-y-5">
        <fieldset
          v-for="l in LEVELS"
          :key="l.key"
          class="space-y-2"
        >
          <legend class="text-sm font-medium">
            {{ l.label }} <span class="font-normal text-muted">- {{ l.help }}</span>
          </legend>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <UFormField label="Length (cm)">
              <UInput
                v-model="form.packaging[l.key].lengthCm"
                inputmode="decimal"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Width (cm)">
              <UInput
                v-model="form.packaging[l.key].widthCm"
                inputmode="decimal"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Height (cm)">
              <UInput
                v-model="form.packaging[l.key].heightCm"
                inputmode="decimal"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Weight (kg)">
              <UInput
                v-model="form.packaging[l.key].weightKg"
                inputmode="decimal"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Qty inside">
              <UInput
                v-model="form.packaging[l.key].qtyInside"
                inputmode="numeric"
                class="w-full"
              />
            </UFormField>
          </div>
        </fieldset>
      </div>
    </UCard>

    <UCard v-if="chosenCategory">
      <template #header>
        <h2 class="font-semibold">
          {{ chosenCategory.name }} attributes
        </h2>
      </template>
      <p
        v-if="!attributes.length"
        class="text-sm text-muted"
      >
        This category has no extra fields. Admins can add them on the Categories & attributes tab.
      </p>
      <div
        v-else
        class="grid gap-4 sm:grid-cols-2"
      >
        <UFormField
          v-for="a in attributes"
          :key="a.id"
          :label="a.name"
          :required="a.required"
        >
          <USelect
            v-if="a.type === 'list'"
            :model-value="form.attributes[a.id] || UNSET"
            :items="choiceItems(a.options)"
            class="w-full"
            @update:model-value="setAttribute(a.id, $event as string)"
          />
          <USelect
            v-else-if="a.type === 'yesno'"
            :model-value="form.attributes[a.id] || UNSET"
            :items="yesNoItems"
            class="w-full"
            @update:model-value="setAttribute(a.id, $event as string)"
          />
          <UInput
            v-else
            :model-value="form.attributes[a.id] ?? ''"
            :inputmode="a.type === 'number' ? 'decimal' : 'text'"
            class="w-full"
            @update:model-value="setAttribute(a.id, String($event))"
          />
        </UFormField>
      </div>
    </UCard>

    <div class="flex flex-wrap justify-end gap-2">
      <UButton
        label="Cancel"
        color="neutral"
        variant="outline"
        :disabled="saving"
        @click="emit('cancel')"
      />
      <UButton
        type="submit"
        :label="submitLabel ?? 'Save product'"
        :loading="saving"
        data-testid="product-save"
      />
    </div>
  </form>
</template>
