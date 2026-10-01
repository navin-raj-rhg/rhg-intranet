<script setup lang="ts">
import type { CalendarRow } from '~~/shared/utils/leaveCalendar'

// Everyone with a role on this tool can see who is away (approved leave only).
// The leave type and reason are never sent to the browser - just names and dates.
const today = todayMY()
const [todayYear, todayMonth] = today.split('-').map(Number) as [number, number]

const year = ref(todayYear)
const month = ref(todayMonth)
const selected = ref<string | null>(today)

const weeks = computed(() => monthGrid(year.value, month.value))
const range = computed(() => gridRange(year.value, month.value))

const { data: rows, pending, error, refresh } = await useAsyncData(
  'leave-team-calendar',
  () => useApiFetch<CalendarRow[]>('/api/tools/leave-applications/calendar', { query: range.value }),
  { watch: [range] }
)

const away = computed(() => awayByDate(rows.value ?? []))

// Public holidays in view, highlighted differently from leave.
const { data: holidayRows } = await useAsyncData(
  'leave-team-calendar-holidays',
  () => useApiFetch<{ date: string, name: string }[]>('/api/tools/leave-applications/holidays', { query: range.value }),
  { watch: [range] }
)
const holidayNames = computed(() => new Map((holidayRows.value ?? []).map(h => [h.date, h.name])))

const MAX_NAMES = 3

function peopleOn(date: string) {
  return away.value.get(date) ?? []
}

function goTo(delta: number) {
  const next = shiftMonth(year.value, month.value, delta)
  year.value = next.year
  month.value = next.month
  selected.value = null
}

function goToday() {
  year.value = todayYear
  month.value = todayMonth
  selected.value = today
}

function pick(date: string, inMonth: boolean) {
  if (!inMonth) return
  selected.value = selected.value === date ? null : date
}

const selectedPeople = computed(() => (selected.value ? peopleOn(selected.value) : []))
const monthIsEmpty = computed(() =>
  !weeks.value.flat().some(d => d.inMonth && peopleOn(d.date).length > 0)
)
</script>

<template>
  <div class="mt-6 space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">
        {{ monthTitle(year, month) }}
      </h2>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          variant="outline"
          color="neutral"
          aria-label="Previous month"
          @click="goTo(-1)"
        />
        <UButton
          variant="outline"
          color="neutral"
          label="Today"
          @click="goToday"
        />
        <UButton
          icon="i-lucide-chevron-right"
          variant="outline"
          color="neutral"
          aria-label="Next month"
          @click="goTo(1)"
        />
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load the calendar"
    >
      <template #actions>
        <UButton
          size="xs"
          variant="outline"
          color="error"
          label="Try again"
          @click="() => refresh()"
        />
      </template>
    </UAlert>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="grid grid-cols-7 border-b border-default text-center text-xs font-medium text-muted">
        <div
          v-for="label in WEEKDAY_LABELS"
          :key="label"
          class="py-2"
        >
          {{ label }}
        </div>
      </div>

      <div
        class="transition-opacity"
        :class="pending ? 'opacity-60' : ''"
      >
        <div
          v-for="(week, w) in weeks"
          :key="w"
          class="grid grid-cols-7"
          :class="w > 0 ? 'border-t border-default' : ''"
        >
          <button
            v-for="day in week"
            :key="day.date"
            type="button"
            :data-date="day.date"
            :disabled="!day.inMonth"
            class="min-h-16 border-l border-default p-1 text-left align-top first:border-l-0 sm:min-h-24 sm:p-1.5"
            :class="[
              day.isWeekend ? 'bg-elevated/50' : '',
              holidayNames.has(day.date) ? 'bg-info/10' : '',
              day.inMonth ? 'cursor-pointer hover:bg-elevated' : 'cursor-default opacity-40',
              selected === day.date ? 'ring-2 ring-inset ring-primary' : ''
            ]"
            @click="pick(day.date, day.inMonth)"
          >
            <span
              class="inline-flex size-6 items-center justify-center rounded-full text-xs"
              :class="day.date === today ? 'bg-primary font-semibold text-inverted' : 'text-muted'"
            >
              {{ Number(day.date.slice(8)) }}
            </span>

            <span
              v-if="day.inMonth && holidayNames.has(day.date)"
              class="mt-1 block truncate rounded border border-info/40 px-1 text-xs text-info"
              :title="holidayNames.get(day.date)"
              data-testid="calendar-holiday"
            >
              {{ holidayNames.get(day.date) }}
            </span>

            <template v-if="day.inMonth && peopleOn(day.date).length">
              <!-- Wide screens: names. -->
              <ul class="mt-1 hidden space-y-0.5 sm:block">
                <li
                  v-for="person in peopleOn(day.date).slice(0, MAX_NAMES)"
                  :key="person.employeeId"
                  class="truncate rounded bg-primary/10 px-1 text-xs text-highlighted"
                  :title="person.weight < 1 ? `${person.name} (half day)` : person.name"
                >
                  {{ person.name }}<span
                    v-if="person.weight < 1"
                    class="text-muted"
                  > ½</span>
                </li>
                <li
                  v-if="peopleOn(day.date).length > MAX_NAMES"
                  class="px-1 text-xs text-muted"
                >
                  +{{ peopleOn(day.date).length - MAX_NAMES }} more
                </li>
              </ul>
              <!-- Phones: just a count, tap for the names. -->
              <span
                class="mt-1 block rounded bg-primary/10 px-1 text-center text-xs font-medium text-highlighted sm:hidden"
              >
                {{ peopleOn(day.date).length }}
              </span>
            </template>
          </button>
        </div>
      </div>
    </UCard>

    <p
      v-if="!pending && !error && monthIsEmpty"
      class="text-sm text-muted"
    >
      Nobody has approved leave this month.
    </p>

    <UCard v-if="selected">
      <template #header>
        <h3 class="font-medium">
          {{ formatDateMY(selected) }} · {{ weekdayShort(selected) }}
        </h3>
      </template>
      <ul
        v-if="selectedPeople.length"
        class="space-y-1 text-sm"
        data-testid="away-list"
      >
        <li
          v-for="person in selectedPeople"
          :key="person.employeeId"
        >
          {{ person.name }}
          <span
            v-if="person.weight < 1"
            class="text-muted"
          >(half day)</span>
        </li>
      </ul>
      <p
        v-if="holidayNames.has(selected)"
        class="mb-2 text-sm text-info"
      >
        Public holiday: {{ holidayNames.get(selected) }}
      </p>
      <p
        v-if="!selectedPeople.length"
        class="text-sm text-muted"
      >
        {{ holidayNames.has(selected) ? 'Nobody is on leave.' : isWorkingDay(selected) ? 'Everyone is in.' : 'Weekend.' }}
      </p>
    </UCard>
  </div>
</template>
