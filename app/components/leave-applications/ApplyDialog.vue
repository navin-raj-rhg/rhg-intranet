<script setup lang="ts">
import type { LeavePreviewResponse, LeaveTypeBalanceItem } from '~~/shared/types/leave'

/**
 * "Apply for leave" dialog. As the person fills it in, the same checks that
 * submitting will run are run by the preview route (nothing is saved), so
 * rule errors - wrong birth month, clashing leave, no working days - and the
 * effect on their balance show up before they press Submit.
 */
const props = defineProps<{
  types: LeaveTypeBalanceItem[]
  canApply: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ submitted: [] }>()

const toast = useToast()
const { uploadFile } = useR2Storage()

const form = reactive({
  leaveTypeId: undefined as number | undefined,
  // ISO dates from the browser's own date field (it moves dd -> mm -> yyyy by itself)
  startDate: '',
  endDate: '',
  startHalfDay: false,
  endHalfDay: false,
  reason: ''
})

// Optional attachment (e.g. a medical certificate), uploaded when submitting.
const attachment = ref<File | null>(null)
const attachmentError = ref<string | undefined>()
const fileInputRef = ref<HTMLInputElement | null>(null)

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null
  attachmentError.value = file ? (checkAttachment(file) ?? undefined) : undefined
  attachment.value = file && !attachmentError.value ? file : null
  if (attachmentError.value && fileInputRef.value) fileInputRef.value.value = ''
}

function clearAttachment() {
  attachment.value = null
  attachmentError.value = undefined
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function resetForm() {
  clearAttachment()
  form.leaveTypeId = undefined
  form.startDate = ''
  form.endDate = ''
  form.startHalfDay = false
  form.endHalfDay = false
  form.reason = ''
}

const typeItems = computed(() =>
  props.types.map(t => ({ label: t.name, value: t.leaveTypeId }))
)
const selectedType = computed(() => props.types.find(t => t.leaveTypeId === form.leaveTypeId))
const note = computed(() =>
  selectedType.value ? restrictionNote(selectedType.value.dateRestriction, selectedType.value.restriction) : null
)

const parsed = computed(() => buildLeaveRequest({
  leaveTypeId: form.leaveTypeId,
  startText: form.startDate ? formatDateMY(form.startDate) : '',
  endText: form.endDate ? formatDateMY(form.endDate) : '',
  startHalfDay: form.startHalfDay,
  endHalfDay: form.endHalfDay
}))
const startError = computed(() =>
  parsed.value.status === 'invalid' && parsed.value.field === 'start' ? parsed.value.message : undefined
)
const endError = computed(() =>
  parsed.value.status === 'invalid' && parsed.value.field === 'end' ? parsed.value.message : undefined
)
// Half-day options depend on whether it is one day or several.
const isMultiDay = computed(() => parsed.value.status === 'ready' && parsed.value.isMultiDay)

/* ---- live preview (debounced; stale answers are ignored) ---- */
const preview = ref<LeavePreviewResponse | null>(null)
const previewing = ref(false)
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined

const previewKey = computed(() =>
  parsed.value.status === 'ready' ? JSON.stringify(parsed.value.request) : null
)

watch(previewKey, (key) => {
  clearTimeout(timer)
  const mine = ++seq
  preview.value = null
  previewing.value = false
  if (!key) return

  previewing.value = true
  timer = setTimeout(async () => {
    try {
      const res = await useApiFetch<LeavePreviewResponse>('/api/tools/leave-applications/applications/preview', {
        method: 'POST',
        body: JSON.parse(key)
      })
      if (mine === seq) preview.value = res
    } catch (err) {
      if (mine === seq) preview.value = { ok: false, message: errorText(err) }
    } finally {
      if (mine === seq) previewing.value = false
    }
  }, 350)
})

watch(open, (isOpen) => {
  if (isOpen) {
    resetForm()
  } else {
    clearTimeout(timer)
    seq++
  }
})
onBeforeUnmount(() => clearTimeout(timer))

/* ---- submit ---- */
const submitting = ref(false)
const submitStage = ref<'uploading' | 'saving'>('saving')
const canSubmit = computed(() =>
  props.canApply
  && !submitting.value
  && !previewing.value
  && parsed.value.status === 'ready'
  && preview.value?.ok === true
)

async function submit() {
  if (parsed.value.status !== 'ready' || !canSubmit.value) return
  const request = parsed.value.request

  submitting.value = true
  try {
    let attachmentKey: string | undefined
    if (attachment.value) {
      submitStage.value = 'uploading'
      try {
        attachmentKey = await uploadFile('leave-applications', attachment.value)
      } catch (err) {
        // Don't submit without the file the person meant to attach.
        toast.add({ title: 'Could not upload the attachment', description: errorText(err), color: 'error' })
        return
      }
    }

    submitStage.value = 'saving'
    await useApiFetch('/api/tools/leave-applications/applications', {
      method: 'POST',
      body: { ...request, reason: form.reason.trim() || undefined, attachmentKey }
    })
    toast.add({ title: 'Leave application submitted', description: 'Your manager has been asked to approve it.', color: 'success' })
    open.value = false
    emit('submitted')
  } catch (err) {
    toast.add({ title: 'Could not submit', description: errorText(err), color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Apply for leave"
    description="Working days only (Monday to Friday). Weekends in your range are skipped."
  >
    <template #body>
      <form
        id="apply-leave-form"
        class="space-y-4"
        @submit.prevent="submit"
      >
        <UFormField label="Leave type">
          <USelect
            v-model="form.leaveTypeId"
            :items="typeItems"
            placeholder="Select a leave type"
            class="w-full"
          />
          <p
            v-if="note"
            class="mt-1 text-sm"
            :class="note.blocking ? 'text-warning' : 'text-muted'"
          >
            {{ note.text }}
          </p>
        </UFormField>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UFormField
            label="Start date"
            :error="startError"
          >
            <UInput
              v-model="form.startDate"
              type="date"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="End date"
            help="Leave empty for a single day."
            :error="endError"
          >
            <UInput
              v-model="form.endDate"
              type="date"
              class="w-full"
            />
          </UFormField>
        </div>

        <div
          v-if="parsed.status === 'ready'"
          class="space-y-2"
        >
          <UCheckbox
            v-if="!isMultiDay"
            v-model="form.startHalfDay"
            label="Half day"
          />
          <template v-else>
            <UCheckbox
              v-model="form.startHalfDay"
              label="First day is a half day (starting in the afternoon)"
            />
            <UCheckbox
              v-model="form.endHalfDay"
              label="Last day is a half day (finishing at lunchtime)"
            />
          </template>
        </div>

        <UFormField label="Reason (optional)">
          <UTextarea
            v-model="form.reason"
            class="w-full"
            :rows="2"
            :maxlength="1000"
          />
        </UFormField>

        <UFormField
          label="Attachment (optional)"
          help="For example a medical certificate. An image or a PDF, up to 10 MB."
          :error="attachmentError"
        >
          <div class="flex items-center gap-3">
            <UButton
              type="button"
              variant="outline"
              color="neutral"
              size="sm"
              icon="i-lucide-paperclip"
              @click="fileInputRef?.click()"
            >
              Choose file
            </UButton>
            <span class="truncate text-sm text-muted">
              {{ attachment?.name || 'No file chosen' }}
            </span>
            <UButton
              v-if="attachment"
              type="button"
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-x"
              aria-label="Remove attachment"
              @click="clearAttachment"
            />
          </div>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*,application/pdf"
            class="hidden"
            @change="onFileChange"
          >
        </UFormField>

        <div
          v-if="previewing"
          class="text-sm text-muted"
        >
          Checking…
        </div>
        <UAlert
          v-else-if="preview && !preview.ok"
          color="error"
          variant="subtle"
          :title="preview.message"
        />
        <div
          v-else-if="preview?.ok"
          class="rounded-lg border border-default p-3 text-sm"
        >
          <p class="font-medium">
            {{ pluralDays(preview.days) }} of leave
          </p>
          <p
            v-if="!preview.balanceChecks.length"
            class="text-muted"
          >
            {{ selectedType?.name }} has no balance limit.
          </p>
          <div
            v-for="c in preview.balanceChecks"
            :key="c.cycle.startYear"
            :class="c.exceeds ? 'text-error' : 'text-muted'"
          >
            <p>
              {{ formatDays(c.remainingBefore) }} left → {{ formatDays(c.remainingAfter) }} after this
              ({{ formatDateMY(c.cycle.start) }} - {{ formatDateMY(c.cycle.end) }})
            </p>
            <p
              v-if="c.exceeds"
              class="font-medium"
            >
              Over your balance by {{ pluralDays(-c.remainingAfter) }}. You can still submit it.
            </p>
          </div>
        </div>

        <UAlert
          v-if="!canApply"
          color="warning"
          variant="subtle"
          title="You can't apply yet"
          description="You need an approving manager first. Ask the workspace owner."
        />
      </form>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          @click="open = false"
        >
          Cancel
        </UButton>
        <UButton
          type="submit"
          form="apply-leave-form"
          :disabled="!canSubmit"
          :loading="submitting"
        >
          {{ submitting && submitStage === 'uploading' ? 'Uploading…' : 'Submit application' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
