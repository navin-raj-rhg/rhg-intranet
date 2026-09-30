<script setup lang="ts">
import type { CostModelSavedRow } from '~~/shared/types/costModelling'
import type { ContainerSize, PackLevelInput, PackLevelKey } from '~~/shared/utils/costModel'

/**
 * Read-only product table for a saved model (Step 11.8a): what was typed and
 * every figure exactly as saved. Wide on purpose - it scrolls sideways inside
 * its card, with the product no. pinned on the left.
 */
const props = defineProps<{
  rows: CostModelSavedRow[]
  ports: string[]
  basis: ContainerSize
}>()

const LEVELS: PackLevelKey[] = ['carton', 'outer', 'pallet']

const dims = (l: PackLevelInput) =>
  l.lengthCm && l.widthCm && l.heightCm ? `${l.lengthCm} × ${l.widthCm} × ${l.heightCm}` : '—'
const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-AU'))
const marginClass = (m: number | null) => (m !== null && m < 0 ? 'text-error font-medium' : '')

const landed = (row: CostModelSavedRow, port: string) =>
  row.results.landedByPort.find(l => l.port === port)?.landedAud ?? null

const groupBorder = 'border-l border-default'
const th = 'px-2 py-2 font-medium whitespace-nowrap'
const td = 'px-2 py-2 whitespace-nowrap'

const basisLabel = computed(() => CONTAINER_LABELS[props.basis])
</script>

<template>
  <div class="overflow-x-auto">
    <table
      class="w-full text-sm"
      data-testid="product-table"
    >
      <thead>
        <!-- Group headings -->
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
            colspan="3"
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
            Landed AUD ({{ basisLabel }})
          </th>
          <th
            colspan="5"
            :class="[groupBorder, 'px-2 pt-2 text-center']"
          >
            Pricing
          </th>
        </tr>
        <!-- Column headings -->
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
              L × W × H cm
            </th>
            <th
              :class="[th, 'text-right']"
              title="What's directly inside"
            >
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
          <th :class="[th, groupBorder, 'text-right']">
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
            Ship / unit 20'
          </th>
          <th :class="[th, 'text-right']">
            Ship / unit 40HC
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
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.id"
          class="border-t border-default align-top"
        >
          <td :class="[td, 'sticky left-0 z-10 bg-default font-medium']">
            <span class="inline-flex items-center gap-1">
              {{ row.productNo || '—' }}
              <UTooltip
                v-if="row.results.issues.length"
                :text="row.results.issues.join(' · ')"
              >
                <UIcon
                  name="i-lucide-triangle-alert"
                  class="size-4 text-warning"
                  :aria-label="row.results.issues.join('. ')"
                />
              </UTooltip>
            </span>
          </td>
          <td
            :class="td"
            class="max-w-64 truncate"
            :title="row.description ?? ''"
          >
            {{ row.description || '—' }}
          </td>

          <template
            v-for="k in LEVELS"
            :key="k"
          >
            <td :class="[td, groupBorder, row.results.packing.shippingLevel === k ? 'font-medium' : 'text-muted']">
              {{ dims(row[k]) }}
            </td>
            <td :class="[td, 'text-right']">
              {{ num(row[k].qtyInside) }}
            </td>
            <td :class="[td, 'text-right']">
              {{ formatCbm(row.results.packing.cbm[k]) }}
            </td>
          </template>

          <td :class="[td, groupBorder]">
            <template v-if="row.results.packing.shippingLevel">
              {{ PACK_LEVEL_LABELS[row.results.packing.shippingLevel] }}
              <span class="text-muted">of {{ num(row.results.packing.shippingUnits) }}</span>
            </template>
            <template v-else>
              —
            </template>
          </td>
          <td :class="[td, 'text-right']">
            {{ num(row.results.unitsPer.c20) }}
          </td>
          <td :class="[td, 'text-right']">
            {{ num(row.results.unitsPer.c40hc) }}
          </td>

          <td :class="[td, groupBorder, 'text-right']">
            <span class="text-xs text-muted">{{ row.fobCurrency }}</span> {{ formatAud(row.fobPrice) }}
          </td>
          <td :class="[td, 'text-right']">
            <template v-if="row.toolingCost">
              <span class="text-xs text-muted">{{ row.fobCurrency }}</span> {{ formatAud(row.toolingCost, 0) }}
              <p class="text-xs text-muted">
                AUD {{ formatAud(row.results.toolingAud, 0) }}
              </p>
            </template>
            <template v-else>
              —
            </template>
          </td>
          <td :class="[td, 'text-right']">
            {{ row.dutyPercent ? `${row.dutyPercent}%` : '—' }}
          </td>

          <td :class="[td, groupBorder, 'text-right']">
            {{ formatAud(row.results.netCogsAud) }}
          </td>
          <td
            :class="[td, 'text-right']"
            :title="row.results.shippingPort.c20 ? `Using ${row.results.shippingPort.c20}` : ''"
          >
            {{ formatAud(row.results.shippingPerUnit.c20) }}
          </td>
          <td
            :class="[td, 'text-right']"
            :title="row.results.shippingPort.c40hc ? `Using ${row.results.shippingPort.c40hc}` : ''"
          >
            {{ formatAud(row.results.shippingPerUnit.c40hc) }}
          </td>

          <td
            v-for="(p, i) in ports"
            :key="p"
            :class="[td, 'text-right', i === 0 ? groupBorder : '']"
          >
            <span :class="row.results.landedPort === p ? 'rounded bg-warning/15 px-1.5 py-0.5 font-semibold text-highlighted' : ''">
              {{ formatAud(landed(row, p)) }}
            </span>
          </td>

          <td :class="[td, groupBorder, 'text-right']">
            {{ formatAud(row.buyerBuyPrice) }}
          </td>
          <td :class="[td, 'text-right', marginClass(row.results.rapidMargin)]">
            {{ formatPercent(row.results.rapidMargin) }}
          </td>
          <td :class="[td, 'text-right']">
            {{ formatAud(row.rrpIncGst) }}
          </td>
          <td :class="[td, 'text-right']">
            {{ formatAud(row.results.rrpExGst) }}
          </td>
          <td :class="[td, 'text-right', marginClass(row.results.buyerMargin)]">
            {{ formatPercent(row.results.buyerMargin) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
