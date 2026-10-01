<script setup lang="ts">
import type { InspectionProductSuggestion } from '~~/shared/types/inspection'
import { INSPECTION_MAX_PRODUCTS, INSPECTION_PRODUCT_DESCRIPTION_MAX, INSPECTION_PRODUCT_NO_MAX } from '~~/shared/utils/inspectionRules'

/**
 * The products an inspection covers (Step 12.8): a number and a description per
 * row, as many rows as needed. Typing a product number offers products saved
 * by earlier inspections; picking one fills the description. A number that
 * matches a saved product exactly also fills an empty description when you
 * leave the box. Keyboard: arrow keys to move, Enter to pick, Esc to close.
 */

const rows = defineModel<InspectionProductRow[]>({ required: true })

const focusedKey = ref<number | null>(null)
const open = ref(false)
const suggestions = ref<InspectionProductSuggestion[]>([])
const active = ref(0)

let timer: ReturnType<typeof setTimeout> | undefined
let requestNo = 0

async function lookUp(text: string) {
  const mine = ++requestNo
  try {
    const list = await useApiFetch<InspectionProductSuggestion[]>('/api/tools/inspection-reporting/products', { query: { q: text } })
    if (mine !== requestNo) return // a newer search has started
    suggestions.value = list
    active.value = 0
    open.value = focusedKey.value !== null && list.length > 0
  } catch {
    if (mine === requestNo) open.value = false
  }
}

function onInput(row: InspectionProductRow) {
  clearTimeout(timer)
  const text = row.productNo.trim()
  if (!text) {
    requestNo++
    suggestions.value = []
    open.value = false
    return
  }
  timer = setTimeout(() => lookUp(text), 250)
}

function fillFrom(row: InspectionProductRow, s: InspectionProductSuggestion) {
  if (!row.description.trim() && s.description) row.description = s.description
}

function pick(row: InspectionProductRow, s: InspectionProductSuggestion) {
  row.productNo = s.productNo
  fillFrom(row, s)
  open.value = false
}

function onBlur(row: InspectionProductRow) {
  focusedKey.value = null
  open.value = false
  // An exact match for what was typed fills an empty description.
  const typed = row.productNo.trim().toLowerCase()
  const exact = suggestions.value.find(s => s.productNo.toLowerCase() === typed)
  if (exact) fillFrom(row, exact)
}

function onKeydown(e: KeyboardEvent, row: InspectionProductRow) {
  if (!open.value || !suggestions.value.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = (active.value + 1) % suggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = (active.value - 1 + suggestions.value.length) % suggestions.value.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    pick(row, suggestions.value[active.value]!)
  } else if (e.key === 'Escape') {
    open.value = false
  }
}

function add() {
  if (rows.value.length < INSPECTION_MAX_PRODUCTS) rows.value.push(blankInspectionProductRow())
}

function remove(index: number) {
  rows.value.splice(index, 1)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="space-y-3">
    <p
      v-if="!rows.length"
      class="text-sm text-muted"
    >
      No products added yet.
    </p>

    <div
      v-for="(row, i) in rows"
      :key="row.key"
      class="flex flex-col gap-2 rounded-lg border border-default p-3 sm:flex-row sm:items-start"
      :data-testid="`product-row-${i}`"
    >
      <div class="relative sm:w-56 sm:shrink-0">
        <UInput
          v-model="row.productNo"
          :maxlength="INSPECTION_PRODUCT_NO_MAX"
          placeholder="Product number"
          autocomplete="off"
          class="w-full"
          :aria-label="`Product ${i + 1} number`"
          aria-autocomplete="list"
          data-testid="product-no"
          @update:model-value="onInput(row)"
          @focus="focusedKey = row.key"
          @blur="onBlur(row)"
          @keydown="onKeydown($event, row)"
        />
        <ul
          v-if="open && focusedKey === row.key"
          role="listbox"
          class="absolute top-full left-0 z-20 mt-1 max-h-64 w-80 max-w-[85vw] overflow-y-auto rounded-md bg-default py-1 text-sm shadow-lg ring ring-default"
          data-testid="product-suggestions"
        >
          <li class="px-3 pt-1 pb-1.5 text-xs text-muted">
            Saved products - pick one to fill the description
          </li>
          <li
            v-for="(s, si) in suggestions"
            :key="s.productNo"
            role="option"
            :aria-selected="si === active"
            class="cursor-pointer px-3 py-1.5"
            :class="si === active ? 'bg-elevated' : ''"
            @mousedown.prevent="pick(row, s)"
            @mouseenter="active = si"
          >
            <span class="font-medium text-highlighted">{{ s.productNo }}</span>
            <span
              v-if="s.description"
              class="text-muted"
            > · {{ s.description }}</span>
          </li>
        </ul>
      </div>

      <UInput
        v-model="row.description"
        :maxlength="INSPECTION_PRODUCT_DESCRIPTION_MAX"
        placeholder="Description"
        class="min-w-0 flex-1"
        :aria-label="`Product ${i + 1} description`"
        data-testid="product-description"
      />

      <UButton
        variant="ghost"
        color="error"
        icon="i-lucide-x"
        :aria-label="`Remove product ${i + 1}`"
        class="self-end sm:self-start"
        @click="remove(i)"
      />
    </div>

    <UButton
      variant="outline"
      color="neutral"
      icon="i-lucide-plus"
      label="Add product"
      :disabled="rows.length >= INSPECTION_MAX_PRODUCTS"
      data-testid="add-product"
      @click="add"
    />
  </div>
</template>
