<script setup lang="ts">
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend, type TooltipItem } from 'chart.js'
import { Bar } from 'vue-chartjs'
import type { SalesSummary } from '~~/shared/utils/dashboardData'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

/**
 * Dashboard tile (Step 19.6): sales from the owner's uploaded CSV. A headline
 * year-to-date figure against the same stretch of last year, monthly columns
 * (this year vs last year) and the top customers or categories.
 */
interface SalesResponse {
  upload: { fileName: string, uploadedAt: string } | null
  summary: SalesSummary | null
}

const authStore = useAuthStore()
const theme = useChartTheme()
const colorMode = useColorMode()

const { data, pending, error } = await useAsyncData('dashboard-sales', () =>
  useApiFetch<SalesResponse>('/api/dashboard/charts/sales')
)
const summary = computed(() => data.value?.summary ?? null)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const monthly = computed(() => {
  const s = summary.value
  const t = theme.value
  if (!s) return null
  return {
    data: {
      labels: MONTHS,
      datasets: [
        { label: String(s.year), data: s.months.map(m => m.thisYear), backgroundColor: t.main, borderRadius: 2 },
        { label: String(s.year - 1), data: s.months.map(m => m.lastYear), backgroundColor: t.other, borderRadius: 2 }
      ]
    },
    options: chartOptions(false)
  }
})

const topMode = ref<'customers' | 'categories'>('customers')
const topList = computed(() => (topMode.value === 'customers' ? summary.value?.topCustomers : summary.value?.topCategories) ?? [])
const top = computed(() => {
  const t = theme.value
  return {
    data: {
      labels: topList.value.map(i => i.label),
      datasets: [{ label: 'Sales', data: topList.value.map(i => i.amount), backgroundColor: t.main, borderRadius: 2 }]
    },
    options: chartOptions(true)
  }
})

function chartOptions(horizontal: boolean) {
  const t = theme.value
  const money = (v: unknown) => formatChartMoney(Number(v))
  return {
    indexAxis: horizontal ? ('y' as const) : ('x' as const),
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: horizontal ? { display: false } : { position: 'bottom' as const, labels: { color: t.text, boxWidth: 10, boxHeight: 10 } },
      tooltip: {
        backgroundColor: t.tooltipBg,
        titleColor: t.tooltipText,
        bodyColor: t.tooltipText,
        callbacks: { label: (c: TooltipItem<'bar'>) => `${c.dataset.label}: ${money(horizontal ? c.parsed.x : c.parsed.y)}` }
      }
    },
    scales: {
      x: {
        ticks: horizontal ? { color: t.text, callback: (v: string | number) => formatChartShort(Number(v)) } : { color: t.text },
        grid: { color: horizontal ? t.grid : 'transparent' }
      },
      y: {
        ticks: horizontal ? { color: t.text } : { color: t.text, callback: (v: string | number) => formatChartShort(Number(v)) },
        grid: { color: horizontal ? 'transparent' : t.grid }
      }
    }
  }
}

const change = computed(() => {
  const c = summary.value?.changePercent
  if (c === null || c === undefined) return null
  return { text: `${c > 0 ? '+' : ''}${c}% vs last year`, up: c >= 0 }
})
</script>

<template>
  <UCard data-testid="sales-overview">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon
          name="i-lucide-chart-column"
          class="size-5 text-muted"
        />
        <span class="font-medium">Sales overview</span>
      </div>
    </template>

    <p
      v-if="error"
      class="text-sm text-muted"
    >
      Couldn't load the sales figures.
    </p>
    <p
      v-else-if="pending"
      class="text-sm text-muted"
    >
      Loading…
    </p>
    <div
      v-else-if="!summary"
      class="text-sm text-muted"
    >
      <p>No sales data has been uploaded yet.</p>
      <UButton
        v-if="authStore.profile?.isOwner"
        class="mt-2"
        to="/admin/dashboard-data"
        size="sm"
        variant="outline"
        color="neutral"
        icon="i-lucide-upload"
        label="Upload sales data"
      />
    </div>

    <div v-else>
      <p class="text-xs text-muted">
        {{ summary.year }} so far
      </p>
      <p
        class="text-2xl font-semibold"
        data-testid="sales-ytd"
      >
        {{ formatChartMoney(summary.yearToDate) }}
      </p>
      <p
        class="text-sm"
        :class="change ? (change.up ? 'text-success' : 'text-error') : 'text-muted'"
      >
        <template v-if="change">
          {{ change.up ? '▲' : '▼' }} {{ change.text }} ({{ formatChartMoney(summary.lastYearToDate) }})
        </template>
        <template v-else>
          No sales last year to compare with
        </template>
      </p>

      <p class="mt-4 text-xs font-medium text-muted">
        Sales by month
      </p>
      <div
        v-if="monthly"
        class="h-48"
      >
        <Bar
          :key="`m-${colorMode.value}`"
          :data="monthly.data"
          :options="monthly.options"
        />
      </div>

      <div class="mt-4 flex items-center justify-between gap-2">
        <p class="text-xs font-medium text-muted">
          Top {{ topMode }} this year
        </p>
        <div class="flex gap-1">
          <UButton
            size="xs"
            :variant="topMode === 'customers' ? 'solid' : 'outline'"
            color="neutral"
            label="Customers"
            @click="topMode = 'customers'"
          />
          <UButton
            size="xs"
            :variant="topMode === 'categories' ? 'solid' : 'outline'"
            color="neutral"
            label="Categories"
            @click="topMode = 'categories'"
          />
        </div>
      </div>
      <p
        v-if="!topList.length"
        class="mt-2 text-sm text-muted"
      >
        No {{ topMode }} in the file.
      </p>
      <div
        v-else
        class="h-44"
      >
        <Bar
          :key="`t-${topMode}-${colorMode.value}`"
          :data="top.data"
          :options="top.options"
        />
      </div>
    </div>
  </UCard>
</template>
