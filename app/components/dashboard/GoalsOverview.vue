<script setup lang="ts">
import { Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, type TooltipItem } from 'chart.js'
import { Line } from 'vue-chartjs'
import type { GoalProgress } from '~~/shared/utils/dashboardData'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend)

/**
 * Dashboard tile (Step 19.7): goals from the owner's uploaded CSV. Each goal
 * is a progress bar (actual against target for its latest month); clicking a
 * goal shows its month-by-month trend.
 */
interface GoalsResponse {
  upload: { fileName: string, uploadedAt: string } | null
  goals: GoalProgress[]
}

const authStore = useAuthStore()
const theme = useChartTheme()
const colorMode = useColorMode()

const { data, pending, error } = await useAsyncData('dashboard-goals', () =>
  useApiFetch<GoalsResponse>('/api/dashboard/charts/goals')
)
const goals = computed(() => data.value?.goals ?? [])

const selectedName = ref<string | null>(null)
const selected = computed(() => goals.value.find(g => g.goal === selectedName.value) ?? goals.value[0] ?? null)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monthLabel(period: string): string {
  return `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(2, 4)}`
}

/** 87,500 AUD -> $87,500; 30 % -> 30%; 2 launches -> 2 launches. */
function formatGoalValue(n: number, unit: string | null): string {
  const u = (unit ?? '').trim()
  if (u.toUpperCase() === 'AUD') return formatChartMoney(n)
  const num = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 }).format(n)
  if (u === '%') return `${num}%`
  return u ? `${num} ${u}` : num
}

// Months that haven't started yet have no actual to draw, whatever the file says.
const thisMonth = todayMY().slice(0, 7)

const trend = computed(() => {
  const g = selected.value
  const t = theme.value
  if (!g) return null
  return {
    data: {
      labels: g.history.map(h => monthLabel(h.period)),
      datasets: [
        { label: 'Actual', data: g.history.map(h => (h.period > thisMonth ? null : h.actual)), borderColor: t.main, backgroundColor: t.main, pointRadius: 3, tension: 0.25 },
        { label: 'Target', data: g.history.map(h => h.target), borderColor: t.other, backgroundColor: t.other, borderDash: [5, 4], pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' as const, labels: { color: t.text, boxWidth: 10, boxHeight: 10 } },
        tooltip: {
          backgroundColor: t.tooltipBg,
          titleColor: t.tooltipText,
          bodyColor: t.tooltipText,
          callbacks: { label: (c: TooltipItem<'line'>) => `${c.dataset.label}: ${formatGoalValue(Number(c.parsed.y), g.unit)}` }
        }
      },
      scales: {
        x: { ticks: { color: t.text }, grid: { color: 'transparent' } },
        y: { beginAtZero: true, ticks: { color: t.text, callback: (v: string | number) => formatChartShort(Number(v)) }, grid: { color: t.grid } }
      }
    }
  }
})
</script>

<template>
  <UCard data-testid="goals-overview">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon
          name="i-lucide-target"
          class="size-5 text-muted"
        />
        <span class="font-medium">Goals overview</span>
      </div>
    </template>

    <p
      v-if="error"
      class="text-sm text-muted"
    >
      Couldn't load the goals.
    </p>
    <p
      v-else-if="pending"
      class="text-sm text-muted"
    >
      Loading…
    </p>
    <div
      v-else-if="!goals.length"
      class="text-sm text-muted"
    >
      <p>No goals data has been uploaded yet.</p>
      <UButton
        v-if="authStore.profile?.isOwner"
        class="mt-2"
        to="/admin/dashboard-data"
        size="sm"
        variant="outline"
        color="neutral"
        icon="i-lucide-upload"
        label="Upload goals data"
      />
    </div>

    <div v-else>
      <ul class="space-y-2">
        <li
          v-for="g in goals"
          :key="g.goal"
        >
          <button
            type="button"
            class="w-full rounded-md p-2 text-left transition hover:bg-elevated"
            :class="selected?.goal === g.goal ? 'bg-elevated' : ''"
            :data-testid="`goal-${g.goal}`"
            :aria-pressed="selected?.goal === g.goal"
            @click="selectedName = g.goal"
          >
            <span class="flex items-baseline justify-between gap-2 text-sm">
              <span class="min-w-0 truncate font-medium">{{ g.goal }}</span>
              <span class="shrink-0 font-semibold">{{ g.percent === null ? '–' : `${g.percent}%` }}</span>
            </span>
            <UProgress
              class="mt-1"
              size="sm"
              :model-value="Math.min(g.percent ?? 0, 100)"
              :color="(g.percent ?? 0) >= 100 ? 'success' : 'primary'"
            />
            <span class="mt-1 block text-xs text-muted">
              {{ monthLabel(g.period) }}: {{ formatGoalValue(g.actual, g.unit) }} of {{ formatGoalValue(g.target, g.unit) }}
            </span>
          </button>
        </li>
      </ul>

      <template v-if="selected && trend">
        <p class="mt-4 text-xs font-medium text-muted">
          {{ selected.goal }}: month by month
        </p>
        <div class="h-44">
          <Line
            :key="`${selected.goal}-${colorMode.value}`"
            :data="trend.data"
            :options="trend.options"
          />
        </div>
      </template>
    </div>
  </UCard>
</template>
