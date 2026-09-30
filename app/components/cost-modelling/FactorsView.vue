<script setup lang="ts">
import type { CostFactorsResponse } from '~~/shared/types/costModelling'
import type { ContainerSize } from '~~/shared/utils/costModel'

/**
 * Factors tab (Step 11.5). Everyone with the tool sees the live Factors;
 * admins and the owner (canEdit) get inputs and a Save bar. Saved cost models
 * are never affected - they keep a copy of the Factors they were costed with.
 */

const toast = useToast()

const { data, error, refresh } = await useAsyncData('cost-modelling-factors', () =>
  useApiFetch<CostFactorsResponse>('/api/tools/cost-modelling/factors')
)

const canEdit = computed(() => data.value?.canEdit ?? false)
const size = ref<ContainerSize>('c20')

/* ------------------------------------------------------------------ */
/* Form state: every cell is text while typing                         */
/* ------------------------------------------------------------------ */

type Pair = Record<ContainerSize, string>
interface FormState {
  usdToAud: string
  cnyToAud: string
  containerCbm20: string
  containerCbm40hc: string
  freight: Record<string, Pair> // key `${originId}:${destinationId}`
  local: Record<string, Pair> // key `${destinationId}:${feeTypeId}`
}

const form = reactive<FormState>({ usdToAud: '', cnyToAud: '', containerCbm20: '', containerCbm40hc: '', freight: {}, local: {} })
const baseline = ref('')

const fKey = (o: number, d: number) => `${o}:${d}`
const lKey = (d: number, f: number) => `${d}:${f}`

function loadForm(d: CostFactorsResponse) {
  form.usdToAud = String(d.settings.usdToAud)
  form.cnyToAud = String(d.settings.cnyToAud)
  form.containerCbm20 = String(d.settings.containerCbm20)
  form.containerCbm40hc = String(d.settings.containerCbm40hc)
  form.freight = Object.fromEntries(d.freight.map(r => [fKey(r.originPortId, r.destinationPortId), { c20: String(r.usd20), c40hc: String(r.usd40hc) }]))
  form.local = Object.fromEntries(d.localCosts.map(r => [lKey(r.destinationPortId, r.feeTypeId), { c20: String(r.aud20), c40hc: String(r.aud40hc) }]))
  baseline.value = JSON.stringify(form)
}

watch(data, (d) => {
  if (d) loadForm(d)
}, { immediate: true })

const dirty = computed(() => canEdit.value && baseline.value !== '' && JSON.stringify(form) !== baseline.value)

/** Blank = 0; anything that isn't a plain number = null (invalid). */
function parse(text: string): number | null {
  const t = text.trim().replace(/,/g, '')
  if (t === '') return 0
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const val = (text: string | undefined) => parse(text ?? '') ?? 0
const bad = (text: string | undefined) => {
  const n = parse(text ?? '')
  return n === null || n < 0
}
const badRate = (text: string) => {
  const n = parse(text)
  return n === null || n <= 0
}

const problems = computed(() => {
  const list: string[] = []
  if (badRate(form.usdToAud)) list.push('USD to AUD must be more than 0')
  if (badRate(form.cnyToAud)) list.push('CNY to AUD must be more than 0')
  if (badRate(form.containerCbm20) || badRate(form.containerCbm40hc)) list.push('Container CBM must be more than 0')
  if (Object.values(form.freight).some(p => bad(p.c20) || bad(p.c40hc))) list.push('A freight rate isn\'t a valid number')
  if (Object.values(form.local).some(p => bad(p.c20) || bad(p.c40hc))) list.push('A local cost isn\'t a valid number')
  return list
})

/* ------------------------------------------------------------------ */
/* Live figures (from what's on screen, so totals follow typing)       */
/* ------------------------------------------------------------------ */

const origins = computed(() => data.value?.origins ?? [])
const destinations = computed(() => data.value?.destinations ?? [])
const feeTypes = computed(() => data.value?.feeTypes ?? [])

const localTotal = (destId: number, s: ContainerSize) =>
  feeTypes.value.reduce((sum, f) => sum + val(form.local[lKey(destId, f.id)]?.[s]), 0)

const containerCost = (originId: number, destId: number, s: ContainerSize) =>
  val(form.freight[fKey(originId, destId)]?.[s]) * val(form.usdToAud) + localTotal(destId, s)

/** Per ship-from port: the AU port with the highest cost per container. */
const worstPort = computed(() => Object.fromEntries(origins.value.map((o) => {
  let worst: number | null = null
  let worstCost = 0 // nothing highlighted until a port actually costs something
  for (const d of destinations.value) {
    const c = containerCost(o.id, d.id, size.value)
    if (c > worstCost) {
      worstCost = c
      worst = d.id
    }
  }
  return [o.id, worst]
})))

/** How many cells are still 0 for a container size (shown on the switch). */
function blankCount(s: ContainerSize) {
  return Object.values(form.freight).filter(p => val(p[s]) === 0).length
    + Object.values(form.local).filter(p => val(p[s]) === 0).length
}

const sizeItems = computed(() => (['c20', 'c40hc'] as const).map((s) => {
  const blanks = blankCount(s)
  return { label: `${CONTAINER_LABELS[s]}${blanks ? ` (${blanks} blank)` : ''}`, value: s }
}))

/* ------------------------------------------------------------------ */
/* Save / discard                                                      */
/* ------------------------------------------------------------------ */

const saving = ref(false)

async function save() {
  if (!data.value || problems.value.length) return
  saving.value = true
  try {
    const body = {
      expectedUpdatedAt: data.value.settings.updatedAt,
      usdToAud: val(form.usdToAud),
      cnyToAud: val(form.cnyToAud),
      containerCbm20: val(form.containerCbm20),
      containerCbm40hc: val(form.containerCbm40hc),
      freight: data.value.freight.map(r => ({
        originPortId: r.originPortId,
        destinationPortId: r.destinationPortId,
        usd20: val(form.freight[fKey(r.originPortId, r.destinationPortId)]?.c20),
        usd40hc: val(form.freight[fKey(r.originPortId, r.destinationPortId)]?.c40hc)
      })),
      localCosts: data.value.localCosts.map(r => ({
        destinationPortId: r.destinationPortId,
        feeTypeId: r.feeTypeId,
        aud20: val(form.local[lKey(r.destinationPortId, r.feeTypeId)]?.c20),
        aud40hc: val(form.local[lKey(r.destinationPortId, r.feeTypeId)]?.c40hc)
      }))
    }
    data.value = await useApiFetch<CostFactorsResponse>('/api/tools/cost-modelling/factors', { method: 'PUT', body })
    toast.add({ title: 'Factors saved', description: 'New cost models will use these values. Saved models are unchanged.', color: 'success' })
  } catch (err) {
    toast.add({
      title: 'Could not save Factors',
      description: errorText(err),
      color: 'error',
      duration: 10000,
      actions: [{ label: 'Reload (discard my changes)', color: 'neutral', variant: 'outline', onClick: () => reload() }]
    })
  } finally {
    saving.value = false
  }
}

function discard() {
  if (data.value) loadForm(data.value)
}

async function reload() {
  baseline.value = ''
  await refresh()
}

// Don't lose edits by navigating away or closing the tab.
onBeforeRouteLeave(() => {
  if (dirty.value && !confirm('You have unsaved Factors changes. Leave without saving?')) return false
})
function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

/* ------------------------------------------------------------------ */
/* Display                                                             */
/* ------------------------------------------------------------------ */

const updatedText = computed(() => {
  const s = data.value?.settings
  if (!s) return ''
  const at = new Date(s.updatedAt)
  const time = at.toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' })
  return `Last updated ${s.updatedByName ? `by ${s.updatedByName} ` : ''}on ${formatDateMY(todayMY(at))} at ${time}`
})

const money = (text: string | undefined) => formatAud(val(text))
const cellClass = 'w-24 text-right'
</script>

<template>
  <div class="mt-8 space-y-8 pb-24">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load Factors"
      :description="errorText(error)"
    />

    <template v-else-if="data">
      <UAlert
        v-if="data.notReadyReason"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Cost models can't be saved yet"
        :description="data.notReadyReason"
      />

      <div class="flex flex-wrap items-center justify-between gap-4">
        <p class="text-sm text-muted">
          {{ updatedText }}
          <template v-if="!canEdit">
            · Only Cost Modelling admins can change Factors.
          </template>
        </p>
        <UTabs
          v-model="size"
          :items="sizeItems"
          :content="false"
          size="sm"
          class="w-auto"
        />
      </div>

      <!-- Exchange rates and container capacity -->
      <UCard>
        <template #header>
          <span class="font-medium">Exchange rates and containers</span>
        </template>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UFormField
            label="USD to AUD"
            hint="1 USD = ? AUD"
          >
            <UInput
              v-if="canEdit"
              v-model="form.usdToAud"
              inputmode="decimal"
              :color="badRate(form.usdToAud) ? 'error' : undefined"
              :highlight="badRate(form.usdToAud)"
              class="w-full"
              aria-label="USD to AUD"
            />
            <p
              v-else
              class="text-lg font-semibold"
            >
              {{ val(form.usdToAud) || '—' }}
            </p>
          </UFormField>
          <UFormField
            label="CNY to AUD"
            hint="1 CNY = ? AUD"
          >
            <UInput
              v-if="canEdit"
              v-model="form.cnyToAud"
              inputmode="decimal"
              :color="badRate(form.cnyToAud) ? 'error' : undefined"
              :highlight="badRate(form.cnyToAud)"
              class="w-full"
              aria-label="CNY to AUD"
            />
            <p
              v-else
              class="text-lg font-semibold"
            >
              {{ val(form.cnyToAud) || '—' }}
            </p>
          </UFormField>
          <UFormField
            label="20' usable CBM"
            hint="m³"
          >
            <UInput
              v-if="canEdit"
              v-model="form.containerCbm20"
              inputmode="decimal"
              :color="badRate(form.containerCbm20) ? 'error' : undefined"
              :highlight="badRate(form.containerCbm20)"
              class="w-full"
              aria-label="20 foot usable CBM"
            />
            <p
              v-else
              class="text-lg font-semibold"
            >
              {{ val(form.containerCbm20) }}
            </p>
          </UFormField>
          <UFormField
            label="40HC usable CBM"
            hint="m³"
          >
            <UInput
              v-if="canEdit"
              v-model="form.containerCbm40hc"
              inputmode="decimal"
              :color="badRate(form.containerCbm40hc) ? 'error' : undefined"
              :highlight="badRate(form.containerCbm40hc)"
              class="w-full"
              aria-label="40HC usable CBM"
            />
            <p
              v-else
              class="text-lg font-semibold"
            >
              {{ val(form.containerCbm40hc) }}
            </p>
          </UFormField>
        </div>
      </UCard>

      <!-- Freight -->
      <UCard>
        <template #header>
          <div>
            <span class="font-medium">Freight – USD per {{ CONTAINER_LABELS[size] }} container</span>
            <p class="text-sm text-muted">
              Ship-from port to AU port. Switch 20' / 40HC above.
            </p>
          </div>
        </template>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="sticky left-0 bg-default py-2 pr-4 font-medium">
                  Ship from
                </th>
                <th
                  v-for="d in destinations"
                  :key="d.id"
                  class="px-2 py-2 text-right font-medium"
                  :title="d.name"
                >
                  {{ d.code }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="o in origins"
                :key="o.id"
                class="border-t border-default"
              >
                <td class="sticky left-0 bg-default py-2 pr-4 font-medium">
                  {{ o.name }}
                </td>
                <td
                  v-for="d in destinations"
                  :key="d.id"
                  class="px-2 py-1 text-right"
                >
                  <UInput
                    v-if="canEdit && form.freight[fKey(o.id, d.id)]"
                    v-model="form.freight[fKey(o.id, d.id)]![size]"
                    inputmode="decimal"
                    size="sm"
                    :class="cellClass"
                    :ui="{ base: 'text-right' }"
                    :color="bad(form.freight[fKey(o.id, d.id)]![size]) ? 'error' : undefined"
                    :highlight="bad(form.freight[fKey(o.id, d.id)]![size])"
                    :aria-label="`Freight ${o.name} to ${d.code} ${CONTAINER_LABELS[size]}`"
                  />
                  <span
                    v-else
                    :class="val(form.freight[fKey(o.id, d.id)]?.[size]) === 0 ? 'text-dimmed' : ''"
                  >
                    {{ money(form.freight[fKey(o.id, d.id)]?.[size]) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <!-- Local costs -->
      <UCard>
        <template #header>
          <div>
            <span class="font-medium">Local costs – AUD per {{ CONTAINER_LABELS[size] }} container</span>
            <p class="text-sm text-muted">
              Charges at the AU port. All lines are added together per container.
            </p>
          </div>
        </template>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="sticky left-0 bg-default py-2 pr-4 font-medium">
                  Charge
                </th>
                <th
                  v-for="d in destinations"
                  :key="d.id"
                  class="px-2 py-2 text-right font-medium"
                  :title="d.name"
                >
                  {{ d.code }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="f in feeTypes"
                :key="f.id"
                class="border-t border-default"
              >
                <td class="sticky left-0 bg-default py-2 pr-4 whitespace-nowrap">
                  {{ f.name }}
                </td>
                <td
                  v-for="d in destinations"
                  :key="d.id"
                  class="px-2 py-1 text-right"
                >
                  <UInput
                    v-if="canEdit && form.local[lKey(d.id, f.id)]"
                    v-model="form.local[lKey(d.id, f.id)]![size]"
                    inputmode="decimal"
                    size="sm"
                    :class="cellClass"
                    :ui="{ base: 'text-right' }"
                    :color="bad(form.local[lKey(d.id, f.id)]![size]) ? 'error' : undefined"
                    :highlight="bad(form.local[lKey(d.id, f.id)]![size])"
                    :aria-label="`${f.name} ${d.code} ${CONTAINER_LABELS[size]}`"
                  />
                  <span
                    v-else
                    :class="val(form.local[lKey(d.id, f.id)]?.[size]) === 0 ? 'text-dimmed' : ''"
                  >
                    {{ money(form.local[lKey(d.id, f.id)]?.[size]) }}
                  </span>
                </td>
              </tr>
              <tr class="border-t-2 border-default font-semibold">
                <td class="sticky left-0 bg-default py-2 pr-4">
                  Total
                </td>
                <td
                  v-for="d in destinations"
                  :key="d.id"
                  class="px-2 py-2 text-right"
                  :data-testid="`local-total-${d.code}`"
                >
                  {{ formatAud(localTotal(d.id, size)) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <!-- Check: what a container really costs -->
      <UCard>
        <template #header>
          <div>
            <span class="font-medium">Cost per {{ CONTAINER_LABELS[size] }} container – AUD</span>
            <p class="text-sm text-muted">
              Freight converted at the USD rate, plus local costs. Cost models use the
              <strong class="text-highlighted">highlighted</strong> (most expensive) AU port for each ship-from port.
            </p>
          </div>
        </template>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="sticky left-0 bg-default py-2 pr-4 font-medium">
                  Ship from
                </th>
                <th
                  v-for="d in destinations"
                  :key="d.id"
                  class="px-2 py-2 text-right font-medium"
                >
                  {{ d.code }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="o in origins"
                :key="o.id"
                class="border-t border-default"
              >
                <td class="sticky left-0 bg-default py-2 pr-4 font-medium">
                  {{ o.name }}
                </td>
                <td
                  v-for="d in destinations"
                  :key="d.id"
                  class="px-2 py-2 text-right"
                  :data-testid="`container-cost-${o.code}-${d.code}`"
                >
                  <span
                    :class="worstPort[o.id] === d.id ? 'rounded bg-warning/15 px-1.5 py-0.5 font-semibold text-highlighted' : ''"
                  >
                    {{ formatAud(containerCost(o.id, d.id, size), 0) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <!-- Save bar (admins) -->
      <div
        v-if="dirty"
        class="fixed inset-x-0 bottom-0 z-20 border-t border-default bg-default/95 backdrop-blur"
      >
        <UContainer class="flex flex-wrap items-center justify-between gap-3 py-3">
          <p class="text-sm">
            <span class="font-medium">Unsaved changes.</span>
            <span
              v-if="problems.length"
              class="text-error"
            >
              {{ problems.join(' · ') }}
            </span>
          </p>
          <div class="flex gap-2">
            <UButton
              label="Discard"
              color="neutral"
              variant="outline"
              :disabled="saving"
              @click="discard"
            />
            <UButton
              label="Save Factors"
              icon="i-lucide-save"
              :loading="saving"
              :disabled="problems.length > 0"
              @click="save"
            />
          </div>
        </UContainer>
      </div>
    </template>
  </div>
</template>
