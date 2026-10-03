<script setup lang="ts">
import type { UpcomingItem } from '~~/shared/utils/eventRules'

// Dashboard tile: the next few company events and public holidays (Step 18).
// Everyone sees it; only the owner gets the "Manage events" link.
const authStore = useAuthStore()
const isOwner = computed(() => !!authStore.profile?.isOwner)

const { data: items, pending, error } = await useAsyncData('dashboard-upcoming-events', () =>
  useApiFetch<UpcomingItem[]>('/api/dashboard/events')
)
</script>

<template>
  <UCard
    class="h-full"
    :ui="{ root: 'flex h-full flex-col', body: 'min-h-0 flex-1 overflow-y-auto' }"
    data-testid="upcoming-events"
  >
    <template #header>
      <span class="font-medium">Upcoming events</span>
    </template>

    <p
      v-if="error"
      class="text-sm text-muted"
    >
      Couldn't load events.
    </p>
    <p
      v-else-if="pending"
      class="text-sm text-muted"
    >
      Loading…
    </p>
    <p
      v-else-if="!items?.length"
      class="text-sm text-muted"
    >
      Nothing coming up.
    </p>
    <ul
      v-else
      class="space-y-3 text-sm"
    >
      <li
        v-for="item in items"
        :key="item.key"
      >
        <p class="text-xs text-muted">
          {{ formatDateRangeMY(item.date, item.endDate ?? item.date) }}<template v-if="item.time">
            · {{ item.time }}
          </template>
        </p>
        <p class="font-medium">
          {{ item.title }}
          <UBadge
            v-if="item.kind === 'holiday'"
            size="sm"
            variant="subtle"
            color="info"
            label="Public holiday"
            class="ml-1 align-middle"
          />
        </p>
        <p
          v-if="item.place"
          class="text-xs text-muted"
        >
          {{ item.place }}
        </p>
        <p
          v-if="item.note"
          class="whitespace-pre-wrap text-xs text-muted"
        >
          {{ item.note }}
        </p>
      </li>
    </ul>

    <template
      v-if="isOwner"
      #footer
    >
      <UButton
        to="/admin/events"
        variant="link"
        color="neutral"
        size="sm"
        class="p-0"
        label="Manage events"
        trailing-icon="i-lucide-arrow-right"
      />
    </template>
  </UCard>
</template>
