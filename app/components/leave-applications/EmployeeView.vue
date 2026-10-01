<script setup lang="ts">
import type { LeaveBalancesResponse, MyLeaveApplication } from '~~/shared/types/leave'

defineProps<{ canApply: boolean }>()

const toast = useToast()

const { data: balances, refresh: refreshBalances } = await useAsyncData('my-leave-balances', () =>
  useApiFetch<LeaveBalancesResponse>('/api/tools/leave-applications/balances')
)
const { data: applications, refresh: refreshApplications } = await useAsyncData('my-leave-applications', () =>
  useApiFetch<MyLeaveApplication[]>('/api/tools/leave-applications/applications')
)

const statusColor: Record<MyLeaveApplication['status'], 'warning' | 'success' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'neutral'
}

const applyOpen = ref(false)

async function refreshAll() {
  await Promise.all([refreshBalances(), refreshApplications()])
}

// --- Cancel ---
const cancellingId = ref<number | null>(null)

async function cancelLeave(app: MyLeaveApplication) {
  const question = app.status === 'approved'
    ? 'Cancel this approved leave? Your manager\'s approval will be withdrawn.'
    : 'Cancel this leave application?'
  if (!confirm(question)) return

  cancellingId.value = app.id
  try {
    await useApiFetch(`/api/tools/leave-applications/applications/${app.id}/cancel`, { method: 'POST' })
    toast.add({ title: 'Leave cancelled', color: 'success' })
    await refreshAll()
  } catch (err) {
    toast.add({ title: 'Could not cancel', description: errorText(err), color: 'error' })
    await refreshAll() // it may have just been decided; show the truth
  } finally {
    cancellingId.value = null
  }
}

// --- View attachment (permission-checked route returns a short-lived link) ---
async function viewAttachment(id: number) {
  try {
    const { attachmentUrl } = await useApiFetch<{ attachmentUrl: string | null }>(`/api/tools/leave-applications/applications/${id}`)
    if (!attachmentUrl) throw new Error('No attachment')
    window.open(attachmentUrl, '_blank')
  } catch {
    toast.add({ title: 'Could not open the attachment', color: 'error' })
  }
}

const allowance = (b: { entitled: number, adjustments: number }) => b.entitled + b.adjustments
</script>

<template>
  <div class="mt-8 space-y-8">
    <UAlert
      v-if="balances?.joinDateMissing || balances?.dateOfBirthMissing"
      color="warning"
      variant="subtle"
      title="Some of your details haven't been set"
      :description="[
        balances?.joinDateMissing ? 'Your join date (your leave entitlement and Anniversary leave depend on it)' : '',
        balances?.dateOfBirthMissing ? 'Your date of birth (Birthday leave depends on it)' : ''
      ].filter(Boolean).join(' and ') + '. Please ask the workspace owner to add them.'"
    />

    <section>
      <div class="mb-3 flex items-center justify-between gap-4">
        <h2 class="text-lg font-semibold">
          My balances
        </h2>
        <UButton
          icon="i-lucide-plus"
          label="Apply for leave"
          :disabled="!balances"
          @click="applyOpen = true"
        />
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <UCard
          v-for="t in balances?.types ?? []"
          :key="t.leaveTypeId"
          :ui="{ body: 'p-4 sm:p-4' }"
        >
          <p class="text-sm text-muted">
            {{ t.name }}
          </p>

          <template v-if="t.balance">
            <p
              class="mt-1 text-2xl font-semibold"
              :class="t.balance.remaining < 0 ? 'text-error' : ''"
            >
              {{ formatDays(t.balance.remaining) }}
              <span class="text-sm font-normal text-muted">left</span>
            </p>
            <p class="text-xs text-muted">
              of {{ formatDays(allowance(t.balance)) }} · {{ formatDays(t.balance.used) }} used<template v-if="t.balance.pending">
                · {{ formatDays(t.balance.pending) }} pending
              </template>
            </p>
            <p class="text-xs text-muted">
              {{ formatDateMY(t.balance.cycle.start) }} - {{ formatDateMY(t.balance.cycle.end) }}
            </p>
          </template>
          <p
            v-else
            class="mt-1 text-2xl font-semibold"
          >
            No limit
          </p>

          <p
            v-if="restrictionNote(t.dateRestriction, t.restriction)"
            class="mt-1 text-xs"
            :class="restrictionNote(t.dateRestriction, t.restriction)!.blocking ? 'text-warning' : 'text-muted'"
          >
            {{ restrictionNote(t.dateRestriction, t.restriction)!.text }}
          </p>
        </UCard>
      </div>
    </section>

    <UCard>
      <template #header>
        <span class="font-medium">My leave</span>
      </template>

      <p
        v-if="!applications?.length"
        class="text-sm text-muted"
      >
        You haven't applied for any leave yet.
      </p>

      <div
        v-for="app in applications"
        :key="app.id"
        class="flex items-start justify-between gap-4 border-b border-default py-3 last:border-b-0"
      >
        <div>
          <p class="font-medium">
            {{ app.leaveTypeName }}
            <UBadge
              :color="statusColor[app.status]"
              variant="subtle"
              class="ml-2"
            >
              {{ leaveStatusLabel(app.status) }}
            </UBadge>
          </p>
          <p class="text-sm text-muted">
            {{ formatDateRangeMY(app.startDate, app.endDate) }} · {{ pluralDays(Number(app.days)) }}<template v-if="describeHalfDays(app)">
              ({{ describeHalfDays(app) }})
            </template>
          </p>
          <p
            v-if="app.reason"
            class="text-sm"
          >
            “{{ app.reason }}”
          </p>
          <p
            v-if="app.decisionNote"
            class="text-sm text-muted"
          >
            Manager's note: {{ app.decisionNote }}
          </p>
        </div>

        <div class="flex shrink-0 gap-2">
          <UButton
            v-if="app.attachmentKey"
            size="xs"
            variant="ghost"
            icon="i-lucide-paperclip"
            @click="viewAttachment(app.id)"
          >
            Attachment
          </UButton>
          <UButton
            v-if="app.canCancel"
            size="xs"
            variant="ghost"
            color="error"
            :loading="cancellingId === app.id"
            @click="cancelLeave(app)"
          >
            Cancel
          </UButton>
        </div>
      </div>
    </UCard>

    <LeaveApplicationsApplyDialog
      v-model:open="applyOpen"
      :types="balances?.types ?? []"
      :can-apply="canApply"
      @submitted="refreshAll"
    />
  </div>
</template>
