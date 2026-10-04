<script setup lang="ts">
import type { CostProductSuggestion } from '~~/shared/types/costModelling'

/**
 * Product no. box with look-up (Step 11.8d). While typing, shows previously
 * costed products whose product no. contains the text; picking one emits
 * `pick` so the form can fill the row's empty cells. Typing a new number just
 * keeps the text. Keyboard: ↓ / ↑ to move, Enter to pick, Esc to close.
 */
const model = defineModel<string>({ required: true })
const props = defineProps<{ label: string }>()
// `match` tells the form what the PIM / earlier costs know about the typed number:
// undefined = not known yet (typing, or the look-up failed), null = checked and
// nothing has exactly this number, otherwise the product that does.
const emit = defineEmits<{
  pick: [product: CostProductSuggestion]
  match: [product: CostProductSuggestion | null | undefined]
}>()

const open = ref(false)
const focused = ref(false)
const loading = ref(false)
const suggestions = ref<CostProductSuggestion[]>([])
const active = ref(0)
const anchorEl = useTemplateRef<HTMLElement>('anchorEl')

let timer: ReturnType<typeof setTimeout> | undefined
let requestNo = 0

async function lookUp(text: string) {
  const mine = ++requestNo
  loading.value = true
  try {
    const list = await useApiFetch<CostProductSuggestion[]>('/api/tools/cost-modelling/products', { query: { q: text } })
    if (mine !== requestNo) return // a newer search has started
    suggestions.value = list
    emit('match', list.find(s => costProductNoKey(s.productNo) === costProductNoKey(text)) ?? null)
    active.value = 0
    open.value = focused.value && list.length > 0
  } catch {
    if (mine === requestNo) {
      open.value = false
      emit('match', undefined)
    }
  } finally {
    if (mine === requestNo) loading.value = false
  }
}

function onInput() {
  clearTimeout(timer)
  emit('match', undefined)
  const text = model.value.trim()
  if (!text) {
    requestNo++
    suggestions.value = []
    open.value = false
    return
  }
  timer = setTimeout(() => lookUp(text), 250)
}

function pick(s: CostProductSuggestion) {
  model.value = s.productNo
  open.value = false
  emit('pick', s)
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value || !suggestions.value.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = (active.value + 1) % suggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = (active.value - 1 + suggestions.value.length) % suggestions.value.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    pick(suggestions.value[active.value]!)
  } else if (e.key === 'Escape') {
    open.value = false
  }
}

function onFocus() {
  focused.value = true
  if (suggestions.value.length && model.value.trim()) open.value = true
}
function onBlur() {
  focused.value = false
  // Options use mousedown.prevent, so a click on one still lands before this closes.
  open.value = false
}

onBeforeUnmount(() => clearTimeout(timer))

const savedOn = (iso: string) => formatDateMY(todayMY(new Date(iso)))
</script>

<template>
  <UPopover
    v-model:open="open"
    :dismissible="false"
    :reference="anchorEl ?? undefined"
    :content="{ side: 'bottom', align: 'start', sideOffset: 4, onOpenAutoFocus: (e: Event) => e.preventDefault(), onCloseAutoFocus: (e: Event) => e.preventDefault() }"
  >
    <template #anchor>
      <div ref="anchorEl">
        <UInput
          v-model="model"
          size="xs"
          class="w-24"
          maxlength="100"
          autocomplete="off"
          :loading="loading"
          :aria-label="props.label"
          aria-autocomplete="list"
          :aria-expanded="open"
          @update:model-value="onInput"
          @keydown="onKeydown"
          @focus="onFocus"
          @blur="onBlur"
        />
      </div>
    </template>

    <template #content>
      <ul
        role="listbox"
        class="max-h-72 w-96 max-w-[90vw] overflow-y-auto py-1 text-sm"
        :aria-label="`Previously costed products for ${props.label}`"
      >
        <li class="px-3 pt-1 pb-1.5 text-xs text-muted">
          From the PIM and earlier cost models - pick one to fill this row's empty cells
        </li>
        <li
          v-for="(s, i) in suggestions"
          :key="s.productNo"
          role="option"
          :aria-selected="i === active"
          class="cursor-pointer px-3 py-1.5"
          :class="i === active ? 'bg-elevated' : ''"
          @mousedown.prevent="pick(s)"
          @mouseenter="active = i"
        >
          <p>
            <span class="font-medium text-highlighted">{{ s.productNo }}</span>
            <span
              v-if="s.description"
              class="text-muted"
            > · {{ s.description }}</span>
          </p>
          <p class="text-xs text-dimmed">
            <span
              v-if="s.pim"
              class="font-medium text-success"
            >In PIM</span>
            <template v-if="s.pim && s.savedAt">
              ·
            </template>
            <template v-if="s.savedAt">
              {{ s.supplierName }} · last costed {{ savedOn(s.savedAt) }}
            </template>
          </p>
        </li>
      </ul>
    </template>
  </UPopover>
</template>
