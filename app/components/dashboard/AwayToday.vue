<script setup lang="ts">
import type { CalendarRow } from '~~/shared/utils/leaveCalendar'

// Dashboard tile: who is on approved leave today (Malaysian date). Only shown
// to people who can open Leave Applications - the same rule as its API. Names
// only, never the leave type. Uses the same /calendar endpoint as the calendar.
const MAX_SHOWN = 8

const today = todayMY()
const workingDay = isWorkingDay(today)

const { data: rows, pending, error } = await useAsyncData('dashboard-away-today', () =>
  useApiFetch<CalendarRow[]>('/api/tools/leave-applications/calendar', { query: { from: today, to: today } })
)

const { data: holidayRows } = await useAsyncData('dashboard-away-today-holiday', () =>
  useApiFetch<{ date: string, name: string }[]>('/api/tools/leave-applications/holidays', { query: { from: today, to: today } })
)
const holidayToday = computed(() => holidayRows.value?.[0]?.name ?? null)

const people = computed(() => awayByDate(rows.value ?? []).get(today) ?? [])
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <span class="font-medium">Away today</span>
        <span class="text-xs text-muted">{{ formatDateMY(today) }}</span>
      </div>
    </template>

    <p
      v-if="error"
      class="text-sm text-muted"
    >
      Couldn't load who is away.
    </p>
    <p
      v-else-if="pending"
      class="text-sm text-muted"
    >
      Loading…
    </p>
    <p
      v-else-if="!workingDay"
      class="text-sm text-muted"
    >
      It's the weekend.
    </p>
    <p
      v-else-if="holidayToday"
      class="text-sm text-info"
    >
      Public holiday: {{ holidayToday }}.
    </p>
    <p
      v-else-if="!people.length"
      class="text-sm text-muted"
    >
      Everyone is in today.
    </p>
    <template v-else>
      <ul
        class="space-y-1 text-sm"
        data-testid="away-today"
      >
        <li
          v-for="person in people.slice(0, MAX_SHOWN)"
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
        v-if="people.length > MAX_SHOWN"
        class="mt-1 text-xs text-muted"
      >
        +{{ people.length - MAX_SHOWN }} more
      </p>
    </template>

    <template #footer>
      <UButton
        to="/tools/leave-applications?tab=calendar"
        variant="link"
        color="neutral"
        size="sm"
        class="p-0"
        label="Open team calendar"
        trailing-icon="i-lucide-arrow-right"
      />
    </template>
  </UCard>
</template>
