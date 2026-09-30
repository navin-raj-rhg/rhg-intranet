<script setup lang="ts">
import type { CostFactorsSnapshot, ContainerSize } from '~~/shared/utils/costModel'

/**
 * The Factors a saved model was costed with (its frozen copy), per AU port:
 * freight, local costs and the total per container. Collapsed by default.
 */
const props = defineProps<{ snapshot: CostFactorsSnapshot }>()

const SIZES: ContainerSize[] = ['c20', 'c40hc']

const worst = computed(() => Object.fromEntries(SIZES.map((sz) => {
  const d = mostExpensiveDestination(props.snapshot.destinations, sz, props.snapshot.usdToAud)
  return [sz, d && containerCostAud(d, sz, props.snapshot.usdToAud) > 0 ? d.port : null]
})) as Record<ContainerSize, string | null>)

const capturedOn = computed(() => formatDateMY(todayMY(new Date(props.snapshot.capturedAt))))
</script>

<template>
  <UCollapsible class="rounded-lg border border-default">
    <UButton
      color="neutral"
      variant="ghost"
      block
      trailing-icon="i-lucide-chevron-down"
      class="justify-between px-4 py-3"
      :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
    >
      <span class="text-left text-sm">
        <span class="font-medium">Factors used</span>
        <span class="text-muted">
          · 1 USD = {{ snapshot.usdToAud }} AUD · 1 CNY = {{ snapshot.cnyToAud }} AUD
          · 20' {{ snapshot.containerCbm.c20 }} m³ · 40HC {{ snapshot.containerCbm.c40hc }} m³
          · from {{ snapshot.originPort.name }} · as at {{ capturedOn }}
        </span>
      </span>
    </UButton>

    <template #content>
      <div class="overflow-x-auto border-t border-default px-4 pb-4">
        <table class="mt-3 w-full text-sm">
          <thead>
            <tr class="text-muted">
              <th
                rowspan="2"
                class="py-2 pr-4 text-left align-bottom font-medium"
              >
                {{ snapshot.originPort.name }} to
              </th>
              <th
                colspan="2"
                class="border-l border-default px-2 text-center font-medium"
              >
                Freight USD
              </th>
              <th
                colspan="2"
                class="border-l border-default px-2 text-center font-medium"
              >
                Local costs AUD
              </th>
              <th
                colspan="2"
                class="border-l border-default px-2 text-center font-medium"
              >
                Per container AUD
              </th>
            </tr>
            <tr class="text-xs text-muted">
              <template
                v-for="g in 3"
                :key="g"
              >
                <th class="border-l border-default px-2 pb-2 text-right font-normal">
                  20'
                </th>
                <th class="px-2 pb-2 text-right font-normal">
                  40HC
                </th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in snapshot.destinations"
              :key="d.port"
              class="border-t border-default"
            >
              <td class="py-2 pr-4 font-medium">
                {{ d.port }}
              </td>
              <td class="border-l border-default px-2 py-2 text-right">
                {{ formatAud(d.freightUsd.c20) }}
              </td>
              <td class="px-2 py-2 text-right">
                {{ formatAud(d.freightUsd.c40hc) }}
              </td>
              <td class="border-l border-default px-2 py-2 text-right">
                {{ formatAud(d.localAud.c20) }}
              </td>
              <td class="px-2 py-2 text-right">
                {{ formatAud(d.localAud.c40hc) }}
              </td>
              <td
                v-for="(sz, i) in SIZES"
                :key="sz"
                class="px-2 py-2 text-right"
                :class="i === 0 ? 'border-l border-default' : ''"
              >
                <span :class="worst[sz] === d.port ? 'rounded bg-warning/15 px-1.5 py-0.5 font-semibold text-highlighted' : ''">
                  {{ formatAud(containerCostAud(d, sz, snapshot.usdToAud), 0) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 text-xs text-muted">
          Highlighted: the most expensive AU port, used for shipping per unit and margins.
        </p>
      </div>
    </template>
  </UCollapsible>
</template>
