<script setup lang="ts">
import type { TeamLeaveApplication } from '~~/shared/types/leave'

/**
 * Approvals inbox for managers (and the owner, who sees everyone). Pending
 * applications first, soonest leave first, then a history of decided ones.
 * Nobody can decide their own leave, so those rows say another manager must.
 */
const authStore = useAuthStore()

const { data: applications, refresh } = await useAsyncData('leave-team-applications', () =>
  useApiFetch<TeamLeaveApplication[]>('/api/tools/leave-applications/applications', { query: { scope: 'team' } })
)

const HISTORY_LIMIT = 50

// Soonest leave first: that's the one that needs an answer soonest.
const pending = computed(() =>
  (applications.value ?? [])
    .filter(a => a.status === 'pending')
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id)
)
// The server returns newest first already.
const decided = computed(() =>
  (applications.value ?? []).filter(a => a.status !== 'pending')
)

const statusColor: Record<TeamLeaveApplication['status'], 'warning' | 'success' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'neutral'
}

const isMine = (a: TeamLeaveApplication) => a.employeeId === authStore.profile?.id

const reviewOpen = ref(false)
const reviewing = ref<TeamLeaveApplication | null>(null)

function review(a: TeamLeaveApplication) {
  reviewing.value = a
  reviewOpen.value = true
}
</script>

<template>
  <div class="mt-8 space-y-8">
    <UCard>
      <template #header>
        <span class="font-medium">Waiting for your approval</span>
      </template>

      <p
        v-if="!pending.length"
        class="text-sm text-muted"
      >
        No leave is waiting for your approval.
      </p>

      <div
        v-for="a in pending"
        :key="a.id"
        class="flex items-start justify-between gap-4 border-b border-default py-3 last:border-b-0"
      >
        <div>
          <p class="font-medium">
            {{ personLabel(a) }}
            <UBadge
              v-if="isMine(a)"
              class="ml-2"
              color="primary"
              variant="subtle"
              size="sm"
            >
              Your leave
            </UBadge>
          </p>
          <p class="text-sm">
            {{ a.leaveTypeName }} · {{ formatDateRangeMY(a.startDate, a.endDate) }} · {{ pluralDays(Number(a.days)) }}<template v-if="describeHalfDays(a)">
              ({{ describeHalfDays(a) }})
            </template>
          </p>
          <p
            v-if="a.reason"
            class="text-sm text-muted"
          >
            “{{ a.reason }}”
          </p>
          <p
            v-if="a.attachmentKey"
            class="text-sm text-muted"
          >
            <UIcon
              name="i-lucide-paperclip"
              class="align-text-bottom"
            />
            Has an attachment
          </p>
        </div>

        <UButton
          v-if="!isMine(a)"
          size="sm"
          @click="review(a)"
        >
          Review
        </UButton>
        <p
          v-else
          class="max-w-40 text-right text-xs text-muted"
        >
          Another manager needs to decide your own leave.
        </p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <span class="font-medium">Recently decided</span>
      </template>

      <p
        v-if="!decided.length"
        class="text-sm text-muted"
      >
        Nothing decided yet.
      </p>

      <div
        v-for="a in decided.slice(0, HISTORY_LIMIT)"
        :key="a.id"
        class="border-b border-default py-3 last:border-b-0"
      >
        <p class="font-medium">
          {{ personLabel(a) }}
          <UBadge
            :color="statusColor[a.status]"
            variant="subtle"
            class="ml-2"
          >
            {{ leaveStatusLabel(a.status) }}
          </UBadge>
        </p>
        <p class="text-sm text-muted">
          {{ a.leaveTypeName }} · {{ formatDateRangeMY(a.startDate, a.endDate) }} · {{ pluralDays(Number(a.days)) }}
        </p>
        <p
          v-if="a.decisionNote"
          class="text-sm text-muted"
        >
          Note: {{ a.decisionNote }}
        </p>
      </div>
    </UCard>

    <LeaveApplicationsDecisionDialog
      v-model:open="reviewOpen"
      :application="reviewing"
      @decided="refresh"
    />
  </div>
</template>
