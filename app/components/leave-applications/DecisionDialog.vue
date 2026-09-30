<script setup lang="ts">
import type { LeaveApplicationDetail, TeamLeaveApplication } from '~~/shared/types/leave'

/**
 * Review dialog for one pending application: the details, the attachment, and
 * what approving it does to the employee's balance, then Approve or Reject with
 * an optional note the employee can read. The balance impact is advice: the
 * manager decides. The server re-checks everything (team, still pending) and
 * guards against two people deciding at once.
 */
const props = defineProps<{ application: TeamLeaveApplication | null }>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ decided: [] }>()

const toast = useToast()

const detail = ref<LeaveApplicationDetail | null>(null)
const loading = ref(false)
const loadError = ref<string | undefined>()
const note = ref('')
const deciding = ref<'approve' | 'reject' | null>(null)

watch([open, () => props.application?.id], async ([isOpen, id]) => {
  detail.value = null
  loadError.value = undefined
  note.value = ''
  if (!isOpen || !id) return

  loading.value = true
  try {
    const result = await useApiFetch<LeaveApplicationDetail>(`/api/tools/leave-applications/applications/${id}`)
    // Ignore an answer for a dialog that has since moved on.
    if (props.application?.id === id) detail.value = result
  } catch (err) {
    if (props.application?.id === id) loadError.value = errorText(err)
  } finally {
    loading.value = false
  }
}, { immediate: true })

async function decide(decision: 'approve' | 'reject') {
  if (!props.application || deciding.value) return

  deciding.value = decision
  try {
    await useApiFetch(`/api/tools/leave-applications/applications/${props.application.id}/${decision}`, {
      method: 'POST',
      body: { note: note.value.trim() || undefined }
    })
    toast.add({ title: decision === 'approve' ? 'Leave approved' : 'Leave rejected', color: 'success' })
    open.value = false
    emit('decided')
  } catch (err) {
    toast.add({ title: `Could not ${decision}`, description: errorText(err), color: 'error' })
    // 409 = someone else (or the applicant) got there first: it is no longer
    // pending, so close and refresh instead of leaving stale buttons.
    if ((err as { statusCode?: number })?.statusCode === 409) {
      open.value = false
      emit('decided')
    }
  } finally {
    deciding.value = null
  }
}

async function viewAttachment() {
  if (!detail.value?.attachmentUrl) return
  window.open(detail.value.attachmentUrl, '_blank')
}

const halfDays = computed(() => (detail.value ? describeHalfDays(detail.value) : ''))
const overBalance = computed(() => detail.value?.balanceImpact?.some(c => c.exceeds) ?? false)
</script>

<template>
  <UModal
    v-model:open="open"
    title="Review leave application"
    :description="application ? personLabel(application) : undefined"
  >
    <template #body>
      <p
        v-if="loading"
        class="text-sm text-muted"
      >
        Loading…
      </p>

      <UAlert
        v-else-if="loadError"
        color="error"
        variant="subtle"
        title="Couldn't load this application"
        :description="loadError"
      />

      <div
        v-else-if="detail"
        class="space-y-4"
      >
        <div>
          <p class="font-medium">
            {{ detail.leaveTypeName }}
          </p>
          <p class="text-sm text-muted">
            {{ formatDateRangeMY(detail.startDate, detail.endDate) }} · {{ pluralDays(Number(detail.days)) }}<template v-if="halfDays">
              ({{ halfDays }})
            </template>
          </p>
          <p
            v-if="detail.reason"
            class="mt-2 text-sm"
          >
            “{{ detail.reason }}”
          </p>
          <UButton
            v-if="detail.attachmentUrl"
            class="mt-2 -ml-2"
            size="xs"
            variant="ghost"
            icon="i-lucide-paperclip"
            @click="viewAttachment"
          >
            View attachment
          </UButton>
        </div>

        <div
          v-if="detail.balanceImpact"
          class="rounded-lg border border-default p-3 text-sm"
        >
          <p class="font-medium">
            Effect on their balance
          </p>
          <p
            v-if="!detail.balanceImpact.length"
            class="text-muted"
          >
            {{ detail.leaveTypeName }} has no balance limit.
          </p>
          <div
            v-for="c in detail.balanceImpact"
            :key="c.cycle.startYear"
            :class="c.exceeds ? 'text-error' : 'text-muted'"
          >
            <p>
              {{ formatDays(c.remainingBefore) }} left → {{ formatDays(c.remainingAfter) }} after approving
              ({{ formatDateMY(c.cycle.start) }} - {{ formatDateMY(c.cycle.end) }})
            </p>
            <p
              v-if="c.exceeds"
              class="font-medium"
            >
              This is {{ pluralDays(-c.remainingAfter) }} more than their balance.
            </p>
          </div>
        </div>

        <UFormField
          label="Note to the employee (optional)"
          :help="overBalance ? 'Worth explaining, since this goes over their balance.' : undefined"
        >
          <UTextarea
            v-model="note"
            class="w-full"
            :rows="2"
            :maxlength="500"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          @click="open = false"
        >
          Close
        </UButton>
        <UButton
          color="error"
          variant="outline"
          :disabled="!detail || !!deciding"
          :loading="deciding === 'reject'"
          @click="decide('reject')"
        >
          Reject
        </UButton>
        <UButton
          :disabled="!detail || !!deciding"
          :loading="deciding === 'approve'"
          @click="decide('approve')"
        >
          Approve
        </UButton>
      </div>
    </template>
  </UModal>
</template>
