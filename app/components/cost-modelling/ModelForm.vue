<script setup lang="ts">
import type { CostFactorsResponse, CostModelDetail, CostPimSyncResult, CostProductSuggestion, PimCategoryName, SaveCostModelBody } from '~~/shared/types/costModelling'
import type { CostCategory } from '~~/shared/utils/costCategories'
import type { ContainerSize, CostRowResult, PackLevelKey } from '~~/shared/utils/costModel'
import type { CostFormRow, FormPackLevel } from '~~/shared/utils/costModelForm'

/**
 * New cost model form (Step 11.8b). Every figure is recalculated live from the
 * current Factors as you type, with the same shared maths the server uses on
 * Save, so what you see is exactly what gets saved.
 */
const props = defineProps<{
  /** Duplicate (Step 11.8c): prefill from this saved model, costed with TODAY's Factors. */
  fromId?: number | null
}>()
const emit = defineEmits<{ saved: [id: number], cancel: [], open: [id: number] }>()

const toast = useToast()

const { data: factors, refresh: refreshFactors } = await useAsyncData('cost-modelling-factors', () =>
  useApiFetch<CostFactorsResponse>('/api/tools/cost-modelling/factors')
)
const { data: categories, refresh: refreshCategories } = await useAsyncData('cost-modelling-categories', () =>
  useApiFetch<CostCategory[]>('/api/tools/cost-modelling/categories')
)

/* ------------------------------------------------------------------ */
/* Form state                                                          */
/* ------------------------------------------------------------------ */

const supplierName = ref('')
const originPortId = ref<number | undefined>(undefined)
const categoryId = ref<number | undefined>(undefined)
const subCategoryId = ref<number | undefined>(undefined)
const containerBasis = ref<ContainerSize>('c40hc')
const notes = ref('')

let nextKey = 1
const rows = ref<CostFormRow[]>([emptyCostFormRow(nextKey++)])

function addRow() {
  const last = rows.value.at(-1)
  rows.value.push(emptyCostFormRow(nextKey++, last?.fobCurrency ?? 'USD'))
}
function copyRow(i: number) {
  const copy = structuredClone(toRaw(rows.value[i]!))
  rows.value.splice(i + 1, 0, { ...copy, key: nextKey++, productNo: '', filledFrom: undefined })
}
/** Product look-up (Step 11.8d, PIM added in 20.3): fill only this row's empty cells from the PIM and the last saved cost. */
async function fillFromProduct(i: number, product: CostProductSuggestion) {
  const row = rows.value[i]
  if (!row) return
  const source = product.pim && product.modelName
    ? `the PIM and ${product.modelName}`
    : (product.pim ? 'the PIM' : (product.modelName ?? 'an earlier cost'))
  const { row: filledRow, filled } = fillEmptyCostFormCells(row, product.input, source)
  rows.value[i] = filledRow
  pimStatus[filledRow.key] = product
  const categoryNote = await fillCategoryFromPim(product)
  toast.add({
    title: filled ? `Filled ${filled} empty cell${filled === 1 ? '' : 's'} from ${product.productNo}` : `Nothing to fill for ${product.productNo}`,
    description: filled
      ? `From ${source}. Anything you'd already typed was kept.${categoryNote}`
      : `Every cell in this row already has a value.${categoryNote}`,
    color: filled ? 'info' : 'neutral',
    duration: 4000
  })
}

/**
 * A product from the PIM also fills the model's category and sub-category, but
 * only while the category is still empty. A category the PIM has and Cost
 * Modelling doesn't is created here under the same name. Returns a sentence for the toast.
 */
async function fillCategoryFromPim(product: CostProductSuggestion): Promise<string> {
  const name = product.pim?.categoryName
  if (!name || categoryId.value) return ''
  const catId = await ensureCostCategory(name)
  if (!catId) return ''
  categoryId.value = catId
  const subName = product.pim?.subCategoryName
  const subId = subName ? await ensureCostSubCategory(catId, subName) : undefined
  if (subId && !subCategoryId.value) subCategoryId.value = subId
  const cat = categories.value?.find(c => c.id === catId)
  const sub = cat?.subCategories.find(s => s.id === subId)
  return ` Category set to ${cat?.name ?? name}${sub ? ` › ${sub.name}` : ''}.`
}

/* What the PIM says about each row's product number (Step 20.3). A missing key
   = not known yet; null = checked, nothing has exactly this number. */
const pimStatus = reactive<Record<number, CostProductSuggestion | null>>({})

function onPimMatch(key: number, match: CostProductSuggestion | null | undefined) {
  if (match === undefined) Reflect.deleteProperty(pimStatus, key)
  else pimStatus[key] = match
}

/** Rows that arrive with a product number (a duplicated model) are checked once. */
async function checkRowsInPim() {
  for (const row of rows.value) {
    const text = row.productNo.trim()
    if (!text) continue
    try {
      const list = await useApiFetch<CostProductSuggestion[]>('/api/tools/cost-modelling/products', { query: { q: text } })
      onPimMatch(row.key, list.find(s => costProductNoKey(s.productNo) === costProductNoKey(text)) ?? null)
    } catch {
      // No note on this row; saving still works.
    }
  }
}
onMounted(checkRowsInPim)

function removeRow(i: number) {
  if (rows.value.length === 1) rows.value = [emptyCostFormRow(nextKey++)]
  else rows.value.splice(i, 1)
}

// Changing the category means the old sub-category no longer applies
// (but not when a category is first set, e.g. while prefilling a duplicate).
watch(categoryId, (_now, before) => {
  if (before !== undefined) subCategoryId.value = undefined
})

/* ------------------------------------------------------------------ */
/* Duplicate: prefill from a saved model                               */
/* ------------------------------------------------------------------ */

const { data: source, error: sourceError } = await useAsyncData(
  `cost-model-source-${props.fromId ?? 'none'}`,
  () => (props.fromId
    ? useApiFetch<CostModelDetail>(`/api/tools/cost-modelling/models/${props.fromId}`)
    : Promise.resolve(null))
)

if (source.value) {
  const m = source.value
  supplierName.value = m.supplierName
  // Only reuse the port / category if they still exist.
  if (factors.value?.origins.some(o => o.id === m.originPortId)) originPortId.value = m.originPortId
  const cat = categories.value?.find(c => c.id === m.categoryId)
  if (cat) {
    categoryId.value = cat.id
    if (m.subCategoryId && cat.subCategories.some(s => s.id === m.subCategoryId)) subCategoryId.value = m.subCategoryId
  }
  containerBasis.value = m.containerBasis
  notes.value = m.notes ?? ''
  rows.value = m.rows.length ? m.rows.map(r => costFormRowFromSaved(nextKey++, r)) : [emptyCostFormRow(nextKey++)]
}

/** Exchange-rate changes since the original was saved, e.g. "USD 1.5 → 1.6". */
const rateChanges = computed(() => {
  const was = source.value?.factorsSnapshot
  const now = factors.value?.settings
  if (!was || !now) return ''
  return [
    was.usdToAud !== now.usdToAud ? `USD ${was.usdToAud} → ${now.usdToAud}` : '',
    was.cnyToAud !== now.cnyToAud ? `CNY ${was.cnyToAud} → ${now.cnyToAud}` : ''
  ].filter(Boolean).join(', ')
})

/* ------------------------------------------------------------------ */
/* Dropdowns                                                           */
/* ------------------------------------------------------------------ */

const originItems = computed(() => (factors.value?.origins ?? []).map(o => ({ label: o.name, value: o.id })))
const basisItems = [
  { label: `20' container`, value: 'c20' as const },
  { label: '40HC container', value: 'c40hc' as const }
]

/* Categories (Step 20.4): the dropdowns list Cost Modelling's own categories plus
   any the PIM has that Cost Modelling doesn't, marked "from PIM". Picking one of
   those creates it here under the same name. */
const { data: pimCategories } = await useAsyncData('cost-modelling-pim-categories', () =>
  useApiFetch<PimCategoryName[]>('/api/tools/cost-modelling/pim-categories').catch(() => [] as PimCategoryName[])
)
const PIM_PREFIX = 'pim:'
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

interface MenuItem { id: number | string, name: string }
const categoryItems = computed<MenuItem[]>(() => {
  const own = categories.value ?? []
  const fromPim = (pimCategories.value ?? [])
    .filter(p => !own.some(c => sameName(c.name, p.name)))
    .map(p => ({ id: `${PIM_PREFIX}${p.name}`, name: `${p.name} (from PIM)` }))
  return [...own, ...fromPim]
})
const subCategoryItems = computed<MenuItem[]>(() => {
  const cat = categories.value?.find(c => c.id === categoryId.value)
  if (!cat) return []
  const pim = pimCategories.value?.find(p => sameName(p.name, cat.name))
  const fromPim = (pim?.subCategories ?? [])
    .filter(name => !cat.subCategories.some(s => sameName(s.name, name)))
    .map(name => ({ id: `${PIM_PREFIX}${name}`, name: `${name} (from PIM)` }))
  return [...cat.subCategories, ...fromPim]
})

/** Finds or creates the Cost Modelling category with this name; returns its id (undefined if it failed). */
async function ensureCostCategory(name: string): Promise<number | undefined> {
  const problem = costNameProblem(name, 'Category')
  if (problem) {
    toast.add({ title: problem, color: 'error' })
    return undefined
  }
  try {
    const { category } = await useApiFetch<{ category: { id: number } }>('/api/tools/cost-modelling/categories', { method: 'POST', body: { name } })
    await refreshCategories()
    return category.id
  } catch (err) {
    toast.add({ title: 'Could not add the category', description: errorText(err), color: 'error' })
    return undefined
  }
}

async function ensureCostSubCategory(parentId: number, name: string): Promise<number | undefined> {
  const problem = costNameProblem(name, 'Sub-category')
  if (problem) {
    toast.add({ title: problem, color: 'error' })
    return undefined
  }
  try {
    const { subCategory } = await useApiFetch<{ subCategory: { id: number } }>(
      `/api/tools/cost-modelling/categories/${parentId}/sub-categories`, { method: 'POST', body: { name } }
    )
    await refreshCategories()
    return subCategory.id
  } catch (err) {
    toast.add({ title: 'Could not add the sub-category', description: errorText(err), color: 'error' })
    return undefined
  }
}

async function createCategory(name: string) {
  const id = await ensureCostCategory(name)
  if (id) categoryId.value = id
}

async function createSubCategory(name: string) {
  if (!categoryId.value) return
  const id = await ensureCostSubCategory(categoryId.value, name)
  if (id) subCategoryId.value = id
}

/** A pick from either dropdown: a "from PIM" item is created here first. */
async function pickCategory(value: number | string | undefined) {
  if (typeof value === 'string' && value.startsWith(PIM_PREFIX)) await createCategory(value.slice(PIM_PREFIX.length))
  else categoryId.value = value as number | undefined
}

async function pickSubCategory(value: number | string | undefined) {
  if (typeof value === 'string' && value.startsWith(PIM_PREFIX)) await createSubCategory(value.slice(PIM_PREFIX.length))
  else subCategoryId.value = value as number | undefined
}

/* ------------------------------------------------------------------ */
/* Live figures                                                        */
/* ------------------------------------------------------------------ */

const snapshot = computed(() => (factors.value && originPortId.value
  ? buildCostFactorsSnapshot(factors.value, originPortId.value, factors.value.settings.updatedAt)
  : null))
const ports = computed(() => factors.value?.destinations.map(d => d.code) ?? [])

const parsed = computed(() => rows.value.map(parseCostFormRow))
const results = computed<(CostRowResult | null)[]>(() => rows.value.map((r, i) =>
  snapshot.value && !costFormRowIsBlank(r) ? calculateCostRow(parsed.value[i]!.input, snapshot.value, containerBasis.value) : null
))

/** Where a row disagrees with the PIM's copy ([] when it agrees or isn't in the PIM). */
function pimDifferenceList(i: number): string[] {
  const row = rows.value[i]
  const pim = row ? pimStatus[row.key]?.pim : null
  if (!row || !pim) return []
  const input = parsed.value[i]!.input
  return pimDifferences({ description: row.description, carton: input.carton, outer: input.outer, pallet: input.pallet }, pim)
}

const isBad = (i: number, field: string) => parsed.value[i]?.badFields.includes(field) ?? false

const header = computed(() => ({
  supplierName: supplierName.value,
  categoryId: categoryId.value ?? null,
  originPortId: originPortId.value ?? null
}))
const problems = computed(() => {
  const list = costFormProblems(header.value, rows.value)
  if (factors.value?.notReadyReason) list.unshift(factors.value.notReadyReason)
  return list
})

const zeroFreight = computed(() => (factors.value && originPortId.value ? zeroFreightPorts(factors.value, originPortId.value) : []))

const dirty = computed(() =>
  supplierName.value.trim() !== '' || !!categoryId.value || notes.value.trim() !== '' || rows.value.some(r => !costFormRowIsBlank(r))
)

/* ------------------------------------------------------------------ */
/* Save                                                                */
/* ------------------------------------------------------------------ */

const saving = ref(false)
const saved = ref(false)
const showProblems = ref(false)

async function save() {
  showProblems.value = true
  if (problems.value.length || !factors.value) return
  saving.value = true
  try {
    const body: SaveCostModelBody = {
      supplierName: supplierName.value,
      categoryId: categoryId.value!,
      subCategoryId: subCategoryId.value ?? null,
      originPortId: originPortId.value!,
      containerBasis: containerBasis.value,
      notes: notes.value.trim() || null,
      factorsUpdatedAt: factors.value.settings.updatedAt,
      duplicatedFromId: source.value?.id ?? null,
      rows: costFormRowsForSave(rows.value)
    }
    const { id, name, pim } = await useApiFetch<{ id: number, name: string, pim: CostPimSyncResult }>('/api/tools/cost-modelling/models', { method: 'POST', body })
    saved.value = true
    toast.add({ title: 'Cost model saved', description: name, color: 'success' })
    if (pim.created.length) {
      toast.add({
        title: `Added ${pim.created.length} new product${pim.created.length === 1 ? '' : 's'} to the PIM`,
        description: `${pim.created.join(', ')} - saved as Drafts. Complete them in Product Information.`,
        color: 'info',
        duration: 8000
      })
    }
    if (pim.skipped.length) {
      toast.add({
        title: 'Some products could not be added to the PIM',
        description: pim.skipped.map(s => (s.productNo ? `${s.productNo}: ${s.reason}` : s.reason)).join(' '),
        color: 'warning',
        duration: 12000
      })
    }
    await refreshNuxtData('cost-models-list')
    emit('saved', id)
  } catch (err) {
    const message = errorText(err)
    if (/Factors were updated|Exchange rate not set/.test(message)) await refreshFactors()
    toast.add({ title: 'Could not save', description: message, color: 'error', duration: 10000 })
  } finally {
    saving.value = false
  }
}

// Don't lose work by navigating away, going back to the list, or closing the tab.
const leaveQuestion = 'You have an unsaved cost model. Leave without saving?'
onBeforeRouteLeave(() => {
  if (dirty.value && !saved.value && !confirm(leaveQuestion)) return false
})
onBeforeRouteUpdate((to) => {
  if (to.query.new) return
  if (dirty.value && !saved.value && !confirm(leaveQuestion)) return false
})
function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value && !saved.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

const LEVELS: PackLevelKey[] = ['carton', 'outer', 'pallet']
const DIMS: (keyof FormPackLevel)[] = ['l', 'w', 'h']
const DIM_NAMES = { l: 'length', w: 'width', h: 'height', qty: 'qty' } as const
const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-AU'))
const marginClass = (m: number | null | undefined) => (m !== null && m !== undefined && m < 0 ? 'text-error font-medium' : '')
const landed = (r: CostRowResult | null, port: string) => r?.landedByPort.find(l => l.port === port)?.landedAud ?? null

const groupBorder = 'border-l border-default'
const th = 'px-1.5 py-2 font-medium whitespace-nowrap'
const td = 'px-1 py-1 whitespace-nowrap'
const calc = 'bg-elevated/50 px-2 text-right tabular-nums'
const inputUi = { base: 'px-1.5 text-right tabular-nums' }
</script>

<template>
  <div class="space-y-6 pb-28">
    <UButton
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="All cost models"
      class="-ml-2"
      @click="emit('cancel')"
    />

    <h2 class="text-xl font-semibold text-highlighted">
      {{ source ? 'Duplicate cost model' : 'New cost model' }}
    </h2>

    <UAlert
      v-if="fromId && sourceError"
      color="error"
      variant="subtle"
      title="Couldn't load the model to copy"
      :description="errorText(sourceError)"
    />
    <UAlert
      v-else-if="source"
      color="info"
      variant="subtle"
      icon="i-lucide-copy"
      title="Copying a saved model"
      data-testid="duplicate-note"
    >
      <template #description>
        Copied from
        <ULink
          class="font-medium underline"
          @click="emit('open', source.id)"
        >
          {{ source.name }}
        </ULink>.
        The figures below use <strong>today's Factors</strong><template v-if="rateChanges">
          (exchange rate changed: {{ rateChanges }})
        </template>. Change what you need and save - this makes a new model; the original stays as it is.
      </template>
    </UAlert>

    <UAlert
      v-if="factors?.notReadyReason"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Cost models can't be saved yet"
      :description="factors.notReadyReason"
    />

    <!-- Header -->
    <UCard>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <UFormField
          label="Supplier name"
          required
        >
          <UInput
            v-model="supplierName"
            placeholder="e.g. Ningbo Tools Co"
            class="w-full"
            maxlength="120"
            aria-label="Supplier name"
          />
        </UFormField>
        <UFormField
          label="Ship from"
          required
        >
          <USelect
            v-model="originPortId"
            :items="originItems"
            placeholder="Choose port"
            class="w-full"
            aria-label="Ship from"
          />
        </UFormField>
        <UFormField
          label="Category"
          required
        >
          <UInputMenu
            :model-value="categoryId"
            :items="categoryItems"
            value-key="id"
            label-key="name"
            create-item
            placeholder="Choose or type new"
            class="w-full"
            aria-label="Category"
            @update:model-value="pickCategory"
            @create="createCategory"
          />
        </UFormField>
        <UFormField
          label="Sub-category"
          hint="Optional"
        >
          <UInputMenu
            :model-value="subCategoryId"
            :items="subCategoryItems"
            value-key="id"
            label-key="name"
            create-item
            :disabled="!categoryId"
            :placeholder="categoryId ? 'Choose or type new' : 'Choose a category first'"
            class="w-full"
            aria-label="Sub-category"
            @update:model-value="pickSubCategory"
            @create="createSubCategory"
          />
        </UFormField>
        <UFormField
          label="Landed cost basis"
        >
          <USelect
            v-model="containerBasis"
            :items="basisItems"
            class="w-full"
            aria-label="Landed cost basis"
          />
        </UFormField>
      </div>
      <UFormField
        label="Notes"
        hint="Optional"
        class="mt-4"
      >
        <UTextarea
          v-model="notes"
          :rows="2"
          autoresize
          class="w-full"
          maxlength="2000"
          placeholder="e.g. quote reference, validity, MOQ"
          aria-label="Notes"
        />
      </UFormField>
      <p
        v-if="zeroFreight.length"
        class="mt-3 text-sm text-warning"
      >
        Freight from this port is still 0 for: {{ zeroFreight.join(', ') }}. Figures for those ports won't include freight until an admin fills it in on Factors.
      </p>
    </UCard>

    <!-- Products -->
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="font-medium">Products</span>
          <span class="text-xs text-muted">
            Sizes in cm. <strong>Qty in</strong> = what's directly inside (carton: units; outer: cartons; pallet: outers, or whatever the level below is).
            Grey cells are calculated<template v-if="!snapshot">
              - choose a ship-from port to see them
            </template>.
          </span>
        </div>
      </template>

      <div class="overflow-x-auto">
        <table
          class="w-full text-sm"
          data-testid="product-form"
        >
          <thead>
            <tr class="text-xs tracking-wide text-muted uppercase">
              <th
                colspan="2"
                class="sticky left-0 z-10 bg-default px-2 pt-2 text-left"
              >
                Product
              </th>
              <th
                v-for="k in LEVELS"
                :key="k"
                colspan="3"
                :class="[groupBorder, 'px-2 pt-2 text-center']"
              >
                {{ PACK_LEVEL_LABELS[k] }}
              </th>
              <th
                colspan="3"
                :class="[groupBorder, 'px-2 pt-2 text-center']"
              >
                Container fill
              </th>
              <th
                colspan="4"
                :class="[groupBorder, 'px-2 pt-2 text-center']"
              >
                Supplier price
              </th>
              <th
                colspan="3"
                :class="[groupBorder, 'px-2 pt-2 text-center']"
              >
                AUD per unit
              </th>
              <th
                :colspan="ports.length"
                :class="[groupBorder, 'px-2 pt-2 text-center']"
              >
                Landed AUD ({{ CONTAINER_LABELS[containerBasis] }})
              </th>
              <th
                colspan="5"
                :class="[groupBorder, 'px-2 pt-2 text-center']"
              >
                Pricing
              </th>
              <th />
            </tr>
            <tr class="text-left text-muted">
              <th :class="[th, 'sticky left-0 z-10 bg-default']">
                No.
              </th>
              <th :class="th">
                Description
              </th>
              <template
                v-for="k in LEVELS"
                :key="k"
              >
                <th :class="[th, groupBorder]">
                  L × W × H
                </th>
                <th :class="[th, 'text-right']">
                  Qty in
                </th>
                <th :class="[th, 'text-right']">
                  CBM
                </th>
              </template>
              <th :class="[th, groupBorder]">
                Ships as
              </th>
              <th :class="[th, 'text-right']">
                Units / 20'
              </th>
              <th :class="[th, 'text-right']">
                Units / 40HC
              </th>
              <th :class="[th, groupBorder]">
                Cur.
              </th>
              <th :class="[th, 'text-right']">
                FOB
              </th>
              <th :class="[th, 'text-right']">
                Tooling
              </th>
              <th :class="[th, 'text-right']">
                Duty %
              </th>
              <th :class="[th, groupBorder, 'text-right']">
                Net COGS
              </th>
              <th :class="[th, 'text-right']">
                Ship 20'
              </th>
              <th :class="[th, 'text-right']">
                Ship 40HC
              </th>
              <th
                v-for="(p, i) in ports"
                :key="p"
                :class="[th, 'text-right', i === 0 ? groupBorder : '']"
              >
                {{ p }}
              </th>
              <th :class="[th, groupBorder, 'text-right']">
                Buyer buy
              </th>
              <th :class="[th, 'text-right']">
                Rapid GM
              </th>
              <th :class="[th, 'text-right']">
                RRP
              </th>
              <th :class="[th, 'text-right']">
                RRP ex GST
              </th>
              <th :class="[th, 'text-right']">
                Buyer GM
              </th>
              <th :class="th" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in rows"
              :key="row.key"
              class="border-t border-default"
            >
              <td :class="[td, 'sticky left-0 z-10 bg-default']">
                <div class="flex items-center gap-1">
                  <CostModellingProductNoInput
                    v-model="row.productNo"
                    :label="`Row ${i + 1} product no.`"
                    @pick="fillFromProduct(i, $event)"
                    @match="onPimMatch(row.key, $event)"
                  />
                  <UTooltip
                    v-if="pimStatus[row.key]?.pim"
                    :text="`In the PIM: ${pimStatus[row.key]!.pim!.name}`"
                  >
                    <UIcon
                      name="i-lucide-package-check"
                      class="size-4 shrink-0 text-success"
                      :aria-label="`In the PIM: ${pimStatus[row.key]!.pim!.name}`"
                      :data-testid="`in-pim-${i}`"
                    />
                  </UTooltip>
                  <UTooltip
                    v-else-if="row.productNo.trim() && pimStatus[row.key] !== undefined"
                    text="Not in the PIM yet - it will be added there as a Draft when you save"
                  >
                    <UIcon
                      name="i-lucide-package-plus"
                      class="size-4 shrink-0 text-info"
                      aria-label="Not in the PIM yet - it will be added there as a Draft when you save"
                      :data-testid="`new-in-pim-${i}`"
                    />
                  </UTooltip>
                  <UTooltip
                    v-if="pimDifferenceList(i).length"
                    :text="`Differs from PIM - ${pimDifferenceList(i).join(' · ')}`"
                  >
                    <UIcon
                      name="i-lucide-git-compare"
                      class="size-4 shrink-0 text-warning"
                      :aria-label="`Differs from PIM. ${pimDifferenceList(i).join('. ')}`"
                      :data-testid="`differs-pim-${i}`"
                    />
                  </UTooltip>
                  <UTooltip
                    v-if="results[i]?.issues.length"
                    :text="results[i]!.issues.join(' · ')"
                  >
                    <UIcon
                      name="i-lucide-triangle-alert"
                      class="size-4 shrink-0 text-warning"
                      :aria-label="results[i]!.issues.join('. ')"
                    />
                  </UTooltip>
                  <UTooltip
                    v-if="row.filledFrom"
                    :text="`Filled from: ${row.filledFrom}`"
                  >
                    <UIcon
                      name="i-lucide-history"
                      class="size-4 shrink-0 text-info"
                      :aria-label="`Filled from: ${row.filledFrom}`"
                      :data-testid="`filled-from-${i}`"
                    />
                  </UTooltip>
                </div>
              </td>
              <td :class="td">
                <UInput
                  v-model="row.description"
                  size="xs"
                  class="w-48"
                  maxlength="500"
                  :aria-label="`Row ${i + 1} description`"
                />
              </td>

              <template
                v-for="k in LEVELS"
                :key="k"
              >
                <td :class="[td, groupBorder]">
                  <div class="flex items-center gap-0.5">
                    <template
                      v-for="(d, di) in DIMS"
                      :key="d"
                    >
                      <span
                        v-if="di > 0"
                        class="text-xs text-dimmed"
                      >×</span>
                      <UInput
                        v-model="row[k][d]"
                        size="xs"
                        inputmode="decimal"
                        class="w-12"
                        :ui="inputUi"
                        :color="isBad(i, `${k}.${d}`) ? 'error' : undefined"
                        :highlight="isBad(i, `${k}.${d}`)"
                        :aria-label="`Row ${i + 1} ${PACK_LEVEL_LABELS[k]} ${DIM_NAMES[d]}`"
                      />
                    </template>
                  </div>
                </td>
                <td :class="td">
                  <UInput
                    v-model="row[k].qty"
                    size="xs"
                    inputmode="numeric"
                    class="w-14"
                    :ui="inputUi"
                    :color="isBad(i, `${k}.qty`) ? 'error' : undefined"
                    :highlight="isBad(i, `${k}.qty`)"
                    :aria-label="`Row ${i + 1} ${PACK_LEVEL_LABELS[k]} qty`"
                  />
                </td>
                <td :class="[td, calc]">
                  {{ formatCbm(results[i]?.packing.cbm[k] ?? null) }}
                </td>
              </template>

              <td :class="[td, groupBorder, 'bg-elevated/50 px-2']">
                <template v-if="results[i]?.packing.shippingLevel">
                  {{ PACK_LEVEL_LABELS[results[i]!.packing.shippingLevel!] }}
                  <span class="text-muted">of {{ num(results[i]!.packing.shippingUnits) }}</span>
                </template>
                <template v-else>
                  —
                </template>
              </td>
              <td
                :class="[td, calc]"
                :data-testid="`units20-${i}`"
              >
                {{ num(results[i]?.unitsPer.c20) }}
              </td>
              <td :class="[td, calc]">
                {{ num(results[i]?.unitsPer.c40hc) }}
              </td>

              <td :class="[td, groupBorder]">
                <USelect
                  v-model="row.fobCurrency"
                  :items="COST_CURRENCIES"
                  size="xs"
                  class="w-20"
                  :aria-label="`Row ${i + 1} currency`"
                />
              </td>
              <td :class="td">
                <UInput
                  v-model="row.fobPrice"
                  size="xs"
                  inputmode="decimal"
                  class="w-20"
                  :ui="inputUi"
                  :color="isBad(i, 'fobPrice') ? 'error' : undefined"
                  :highlight="isBad(i, 'fobPrice')"
                  :aria-label="`Row ${i + 1} FOB price`"
                />
              </td>
              <td :class="td">
                <UInput
                  v-model="row.toolingCost"
                  size="xs"
                  inputmode="decimal"
                  class="w-20"
                  :ui="inputUi"
                  :color="isBad(i, 'toolingCost') ? 'error' : undefined"
                  :highlight="isBad(i, 'toolingCost')"
                  :aria-label="`Row ${i + 1} tooling cost`"
                />
              </td>
              <td :class="td">
                <UInput
                  v-model="row.dutyPercent"
                  size="xs"
                  inputmode="decimal"
                  class="w-14"
                  placeholder="0"
                  :ui="inputUi"
                  :color="isBad(i, 'dutyPercent') ? 'error' : undefined"
                  :highlight="isBad(i, 'dutyPercent')"
                  :aria-label="`Row ${i + 1} duty %`"
                />
              </td>

              <td
                :class="[td, groupBorder, calc]"
                :data-testid="`cogs-${i}`"
              >
                {{ formatAud(results[i]?.netCogsAud ?? null) }}
              </td>
              <td :class="[td, calc]">
                {{ formatAud(results[i]?.shippingPerUnit.c20 ?? null) }}
              </td>
              <td :class="[td, calc]">
                {{ formatAud(results[i]?.shippingPerUnit.c40hc ?? null) }}
              </td>

              <td
                v-for="(p, pi) in ports"
                :key="p"
                :class="[td, calc, pi === 0 ? groupBorder : '']"
                :data-testid="`landed-${i}-${p}`"
              >
                <span :class="results[i]?.landedPort === p ? 'rounded bg-warning/20 px-1 py-0.5 font-semibold text-highlighted' : ''">
                  {{ formatAud(landed(results[i] ?? null, p)) }}
                </span>
              </td>

              <td :class="[td, groupBorder]">
                <UInput
                  v-model="row.buyerBuyPrice"
                  size="xs"
                  inputmode="decimal"
                  class="w-20"
                  :ui="inputUi"
                  :color="isBad(i, 'buyerBuyPrice') ? 'error' : undefined"
                  :highlight="isBad(i, 'buyerBuyPrice')"
                  :aria-label="`Row ${i + 1} buyer buy price`"
                />
              </td>
              <td
                :class="[td, calc, marginClass(results[i]?.rapidMargin)]"
                :data-testid="`rapid-gm-${i}`"
              >
                {{ formatPercent(results[i]?.rapidMargin ?? null) }}
              </td>
              <td :class="td">
                <UInput
                  v-model="row.rrpIncGst"
                  size="xs"
                  inputmode="decimal"
                  class="w-20"
                  :ui="inputUi"
                  :color="isBad(i, 'rrpIncGst') ? 'error' : undefined"
                  :highlight="isBad(i, 'rrpIncGst')"
                  :aria-label="`Row ${i + 1} RRP`"
                />
              </td>
              <td :class="[td, calc]">
                {{ formatAud(results[i]?.rrpExGst ?? null) }}
              </td>
              <td
                :class="[td, calc, marginClass(results[i]?.buyerMargin)]"
                :data-testid="`buyer-gm-${i}`"
              >
                {{ formatPercent(results[i]?.buyerMargin ?? null) }}
              </td>

              <td :class="[td, 'px-1']">
                <div class="flex">
                  <UTooltip text="Copy this row below">
                    <UButton
                      icon="i-lucide-copy"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :aria-label="`Copy row ${i + 1}`"
                      @click="copyRow(i)"
                    />
                  </UTooltip>
                  <UTooltip text="Remove this row">
                    <UButton
                      icon="i-lucide-trash-2"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :aria-label="`Remove row ${i + 1}`"
                      @click="removeRow(i)"
                    />
                  </UTooltip>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <template #footer>
        <UButton
          icon="i-lucide-plus"
          label="Add product"
          color="neutral"
          variant="outline"
          size="sm"
          @click="addRow"
        />
      </template>
    </UCard>

    <!-- Save bar -->
    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-default bg-default/95 backdrop-blur">
      <UContainer class="flex flex-wrap items-center justify-between gap-3 py-3">
        <p
          class="min-w-0 flex-1 text-sm"
          data-testid="form-problems"
        >
          <template v-if="problems.length && (showProblems || factors?.notReadyReason)">
            <span class="text-error">{{ problems.slice(0, 3).join(' · ') }}</span>
            <span
              v-if="problems.length > 3"
              class="text-muted"
            > · and {{ problems.length - 3 }} more</span>
          </template>
          <span
            v-else
            class="text-muted"
          >
            Saved models can't be edited later - use Duplicate to make a changed copy.
          </span>
        </p>
        <div class="flex gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :disabled="saving"
            @click="emit('cancel')"
          />
          <UButton
            label="Save cost model"
            icon="i-lucide-save"
            :loading="saving"
            :disabled="!!factors?.notReadyReason"
            @click="save"
          />
        </div>
      </UContainer>
    </div>
  </div>
</template>
