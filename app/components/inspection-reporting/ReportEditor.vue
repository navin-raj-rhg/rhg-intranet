<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui'
import type { InspectionLocationItem, InspectionPointView, InspectionReportView } from '~~/shared/types/inspection'
import {
  INSPECTION_OVERALL_LABELS,
  INSPECTION_STATUS_LABELS,
  hasNonConformance,
  inspectionOverall,
  inspectionSubmitProblems,
  tallyInspectionPoints,
  type InspectionOverall,
  type InspectionPointResult,
  type InspectionSeverity,
  type InspectionStatus
} from '~~/shared/utils/inspectionRules'

/**
 * An inspection report (Step 12.8). A draft the user may edit is a working
 * form: header, checklist, comments and photos, with Save and Submit for
 * review. Anything else (in review, closed, someone else's draft) shows the
 * same content read-only. Reviewer actions arrive in a later sub-step.
 */

const props = defineProps<{ reportId: number }>()

const toast = useToast()
const { uploadPhoto } = useInspectionPhotos()
const api = `/api/tools/inspection-reporting/reports/${props.reportId}`

const { data: report, error, refresh } = await useAsyncData(`inspection-report-${props.reportId}`, () =>
  useApiFetch<InspectionReportView>(api)
)

const canEdit = computed(() => report.value?.can.edit ?? false)

const { data: allLocations } = await useAsyncData('inspection-report-locations', () =>
  useApiFetch<InspectionLocationItem[]>('/api/tools/inspection-reporting/locations')
)

/* ------------------------------------------------------------------ */
/* Working copy                                                        */
/* ------------------------------------------------------------------ */

const header = reactive({
  locationId: undefined as number | undefined,
  products: [] as InspectionProductRow[],
  reference: '',
  dateText: '',
  notes: ''
})
const points = ref<InspectionPointView[]>([])
const baseline = ref('')

const snapshot = () => JSON.stringify({
  h: header,
  p: points.value.map(p => [p.id, p.result, p.severity, p.comment ?? ''])
})

function load(r: InspectionReportView) {
  header.locationId = r.locationId ?? undefined
  header.products = inspectionProductRowsFrom(r.products)
  if (r.can.edit && header.products.length === 0) header.products.push(blankInspectionProductRow())
  header.reference = r.reference ?? ''
  header.dateText = formatDateMY(r.inspectionDate)
  header.notes = r.notes ?? ''
  points.value = r.points.map(p => ({ ...p, photos: [...p.photos] }))
  baseline.value = snapshot()
}

watch(report, (r) => {
  if (r) load(r)
}, { immediate: true })

const dirty = computed(() => canEdit.value && baseline.value !== '' && snapshot() !== baseline.value)

// Supplier/DC choices: the active ones, plus this report's own if it has since been switched off.
const locationItems = computed(() => {
  const list = (allLocations.value ?? []).filter(l => l.active)
  const own = report.value
  if (own?.locationId && !list.some(l => l.id === own.locationId)) {
    list.push({ id: own.locationId, type: own.locationType, name: own.locationName, active: false })
  }
  const group = (title: string, type: 'supplier' | 'dc'): SelectMenuItem[][] => {
    const items = list.filter(l => l.type === type).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    return items.length ? [[{ type: 'label', label: title }, ...items.map(l => ({ label: l.name, value: l.id }))]] : []
  }
  return [...group('Suppliers', 'supplier'), ...group('DCs', 'dc')]
})

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

const tally = computed(() => tallyInspectionPoints(points.value))
const overall = computed<InspectionOverall>(() =>
  report.value?.overallIsFinal ? report.value.overall : inspectionOverall(tally.value))
const answered = computed(() => tally.value.total - tally.value.unanswered)

const overallColor: Record<InspectionOverall, 'success' | 'warning' | 'error'> = {
  pass: 'success',
  pass_with_conditions: 'warning',
  fail: 'error'
}
const statusColor: Record<InspectionStatus, 'neutral' | 'warning' | 'success'> = {
  draft: 'neutral',
  in_review: 'warning',
  closed: 'success'
}

const sections = computed(() => {
  const out: { name: string, points: { point: InspectionPointView, number: string }[] }[] = []
  for (const p of points.value) {
    // Points arrive in section order, and a template can't have two sections with one name.
    let section = out.find(s => s.name === p.sectionName)
    if (!section) {
      section = { name: p.sectionName, points: [] }
      out.push(section)
    }
    section.points.push({ point: p, number: '' })
  }
  out.forEach((s, si) => s.points.forEach((entry, pi) => {
    entry.number = `${si + 1}.${pi + 1}`
  }))
  return out
})

/* ------------------------------------------------------------------ */
/* Editing                                                             */
/* ------------------------------------------------------------------ */

const highlighted = ref<Set<number>>(new Set())

function change(point: InspectionPointView, patch: { result?: InspectionPointResult | null, severity?: InspectionSeverity | null, comment?: string | null }) {
  if ('result' in patch) point.result = patch.result ?? null
  if ('severity' in patch) point.severity = patch.severity ?? null
  if ('comment' in patch) point.comment = patch.comment ?? null
  if (point.result !== null) highlighted.value.delete(point.id)
}

/* ------------------------------------------------------------------ */
/* Photos                                                              */
/* ------------------------------------------------------------------ */

const photoUrls = ref<Record<number, string>>({})
const uploading = ref<Record<number, boolean>>({})

async function loadPhotoUrls() {
  if (!points.value.some(p => p.photos.length)) return
  try {
    photoUrls.value = await useApiFetch<Record<number, string>>(`${api}/photo-urls`)
  } catch {
    // Thumbnails are a nicety; the rest of the page works without them.
  }
}

watch(report, loadPhotoUrls, { immediate: true })

function onVisible() {
  if (document.visibilityState === 'visible') loadPhotoUrls()
}
onMounted(() => document.addEventListener('visibilitychange', onVisible))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))

async function addPhotos(point: InspectionPointView, files: File[]) {
  uploading.value[point.id] = true
  try {
    for (const file of files) {
      try {
        point.photos.push(await uploadPhoto(props.reportId, point.id, file))
      } catch (err) {
        toast.add({ title: 'Couldn\'t add the photo', description: errorText(err), color: 'error' })
      }
    }
    await loadPhotoUrls()
  } finally {
    uploading.value[point.id] = false
  }
}

async function removePhoto(point: InspectionPointView, photoId: number) {
  try {
    await useApiFetch(`${api}/photos/${photoId}`, { method: 'DELETE' })
    point.photos = point.photos.filter(p => p.id !== photoId)
  } catch (err) {
    toast.add({ title: 'Couldn\'t remove the photo', description: errorText(err), color: 'error' })
  }
}

/* ------------------------------------------------------------------ */
/* Save and submit                                                     */
/* ------------------------------------------------------------------ */

const saving = ref(false)
const submitting = ref(false)
const confirmOpen = ref(false)
const submitProblems = ref<string[]>([])

async function save(quiet = false): Promise<boolean> {
  const iso = parseDateMY(header.dateText)
  if (!iso) {
    toast.add({ title: 'Enter the inspection date as dd/mm/yyyy', color: 'warning' })
    return false
  }
  if (header.locationId === undefined) {
    toast.add({ title: 'Choose a supplier or DC', color: 'warning' })
    return false
  }
  const productProblem = inspectionProductsProblem(inspectionProductsPayload(header.products))
  if (productProblem) {
    toast.add({ title: productProblem, color: 'warning' })
    return false
  }
  saving.value = true
  try {
    await useApiFetch(api, {
      method: 'PUT',
      body: {
        locationId: header.locationId,
        products: inspectionProductsPayload(header.products),
        reference: header.reference.trim() || null,
        inspectionDate: iso,
        notes: header.notes.trim() || null,
        points: points.value.map(p => ({ id: p.id, result: p.result, severity: p.severity, comment: p.comment?.trim() || null }))
      }
    })
    baseline.value = snapshot()
    if (!quiet) toast.add({ title: 'Saved', color: 'success' })
    return true
  } catch (err) {
    toast.add({ title: 'Couldn\'t save', description: errorText(err), color: 'error' })
    return false
  } finally {
    saving.value = false
  }
}

function askSubmit() {
  submitProblems.value = inspectionSubmitProblems(points.value)
  if (submitProblems.value.length) {
    const missing = points.value.filter(p => p.result === null || (p.result === 'non_conformance' && !p.severity))
    highlighted.value = new Set(missing.map(p => p.id))
    if (missing[0]) document.getElementById(`point-${missing[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  confirmOpen.value = true
}

async function submit() {
  submitting.value = true
  try {
    if (!await save(true)) return
    await useApiFetch(`${api}/status`, { method: 'POST', body: { action: 'submit' } })
    confirmOpen.value = false
    toast.add({ title: 'Submitted for review', color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Couldn\'t submit', description: errorText(err), color: 'error' })
  } finally {
    submitting.value = false
  }
}

/* ---- don't lose unsaved work ---- */

function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

// Leaving the page with unsaved changes asks first, in our own dialog (some
// embedded browsers silently block the browser's built-in confirm box).
const leaveOpen = ref(false)
let answerLeave: ((leave: boolean) => void) | null = null

onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return new Promise<boolean>((resolve) => {
    answerLeave = resolve
    leaveOpen.value = true
  })
})

function decideLeave(leave: boolean) {
  const answer = answerLeave
  answerLeave = null
  leaveOpen.value = false
  answer?.(leave)
}

// Closing the dialog any other way (Escape, the X) means "stay".
watch(leaveOpen, (open) => {
  if (!open && answerLeave) decideLeave(false)
})

async function saveAndLeave() {
  if (await save(true)) decideLeave(true)
}

/* ---- history, "sent back" note and reviewer actions ---- */

const eventLabels: Record<string, string> = {
  created: 'Started',
  submitted: 'Submitted for review',
  returned: 'Sent back for changes',
  closed: 'Closed'
}
const when = (iso: string) => formatDateTimeMY(new Date(iso))

// A draft whose latest event is "returned" was sent back by a reviewer: show them why.
const sentBack = computed(() => {
  const last = report.value?.events.at(-1)
  return report.value?.status === 'draft' && last?.action === 'returned' ? last : null
})

const reviewAction = ref<'return' | 'close' | null>(null)
const reviewOpen = computed({
  get: () => reviewAction.value !== null,
  set: (open: boolean) => {
    if (!open) reviewAction.value = null
  }
})
const reviewComment = ref('')
const reviewing = ref(false)

function startReview(action: 'return' | 'close') {
  reviewComment.value = ''
  reviewAction.value = action
}

async function review() {
  const action = reviewAction.value
  if (!action) return
  if (action === 'return' && !reviewComment.value.trim()) {
    toast.add({ title: 'Say what needs changing so the inspector knows what to fix', color: 'warning' })
    return
  }
  reviewing.value = true
  try {
    await useApiFetch(`${api}/status`, { method: 'POST', body: { action, comment: reviewComment.value.trim() || null } })
    toast.add({ title: action === 'close' ? 'Report closed' : 'Sent back to the inspector', color: 'success' })
    reviewAction.value = null
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not do that', description: errorText(err), color: 'error' })
  } finally {
    reviewing.value = false
  }
}

/* ---- PDF ---- */

const downloadingPdf = ref(false)

async function downloadPdf() {
  downloadingPdf.value = true
  try {
    // The API needs the login header, so a plain link can't be used: fetch the file, then save it.
    const blob = await useApiFetch<Blob>(`${api}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `inspection-${props.reportId}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    toast.add({ title: 'Could not create the PDF', description: errorText(err), color: 'error' })
  } finally {
    downloadingPdf.value = false
  }
}

/* ---- delete: discard a draft, or an admin deleting a report ---- */

const discardOpen = ref(false)
const discarding = ref(false)

async function discard() {
  discarding.value = true
  try {
    await useApiFetch(api, { method: 'DELETE' })
    baseline.value = snapshot() // nothing left to lose, so don't ask about unsaved changes
    discardOpen.value = false
    toast.add({ title: report.value?.status === 'draft' ? 'Draft discarded' : 'Report deleted', color: 'success' })
    await navigateTo('/tools/inspection-reporting')
  } catch (err) {
    toast.add({ title: 'Could not delete the report', description: errorText(err), color: 'error' })
  } finally {
    discarding.value = false
  }
}
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    title="Couldn't open this report"
    :description="errorText(error)"
  />

  <div
    v-else-if="report"
    class="space-y-5"
  >
    <!-- Title -->
    <div class="flex flex-wrap items-center gap-3">
      <h2 class="text-xl font-semibold text-highlighted">
        {{ report.locationName }}
      </h2>
      <UBadge
        :color="statusColor[report.status]"
        variant="subtle"
        :label="INSPECTION_STATUS_LABELS[report.status]"
      />
      <UBadge
        v-if="report.status !== 'draft'"
        :color="overallColor[overall]"
        variant="subtle"
        :label="INSPECTION_OVERALL_LABELS[overall]"
      />
      <UButton
        class="ml-auto"
        size="sm"
        variant="outline"
        color="neutral"
        icon="i-lucide-file-down"
        label="Download PDF"
        :loading="downloadingPdf"
        data-testid="download-pdf"
        @click="downloadPdf"
      />
      <UButton
        v-if="report.can.delete"
        size="sm"
        variant="ghost"
        color="error"
        icon="i-lucide-trash-2"
        :label="report.status === 'draft' ? 'Discard draft' : 'Delete report'"
        data-testid="discard-draft"
        @click="discardOpen = true"
      />
    </div>
    <p class="-mt-3 text-sm text-muted">
      Report #{{ report.id }} · {{ report.templateName }} · started by {{ report.createdByName }}
    </p>

    <UAlert
      v-if="sentBack"
      color="warning"
      variant="subtle"
      icon="i-lucide-undo-2"
      :title="`Sent back for changes by ${sentBack.actorName}`"
      :description="sentBack.comment ?? ''"
      data-testid="sent-back"
    />
    <UAlert
      v-if="!canEdit && report.status === 'draft'"
      color="neutral"
      variant="subtle"
      title="This draft is still being filled in"
      description="Only the inspector who started it can edit it."
    />
    <UAlert
      v-else-if="report.status === 'in_review'"
      color="warning"
      variant="subtle"
      title="This report is in review"
      :description="report.can.review ? 'Check the answers and photos, then close the report or send it back to the inspector.' : report.reviewBlockedOwn ? 'You started this report, so another reviewer needs to close it or send it back.' : 'It can\'t be edited while it is being reviewed.'"
    />
    <UAlert
      v-else-if="report.status === 'closed'"
      color="success"
      variant="subtle"
      title="This report is closed"
      description="The result is final and the report can't be changed."
    />

    <!-- Header -->
    <UCard>
      <div
        v-if="canEdit"
        class="grid gap-4 sm:grid-cols-2"
      >
        <UFormField
          label="Supplier or DC"
          required
        >
          <USelectMenu
            v-model="header.locationId"
            :items="locationItems"
            value-key="value"
            class="w-full"
            data-testid="edit-location"
          />
        </UFormField>
        <UFormField
          label="Inspection date"
          required
        >
          <UInput
            v-model="header.dateText"
            placeholder="dd/mm/yyyy"
            inputmode="numeric"
            class="w-full"
            data-testid="edit-date"
          />
        </UFormField>
        <UFormField label="PO / reference">
          <UInput
            v-model="header.reference"
            maxlength="100"
            class="w-full"
            data-testid="edit-reference"
          />
        </UFormField>
        <UFormField
          label="Products inspected"
          class="sm:col-span-2"
          help="Add every product this report covers. A saved product fills in its description."
        >
          <InspectionReportingProductsInput v-model="header.products" />
        </UFormField>
        <UFormField
          label="Notes"
          class="sm:col-span-2"
        >
          <UTextarea
            v-model="header.notes"
            :rows="2"
            autoresize
            maxlength="4000"
            class="w-full"
          />
        </UFormField>
      </div>
      <dl
        v-else
        class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4"
      >
        <div>
          <dt class="text-muted">
            {{ report.locationType === 'dc' ? 'DC' : 'Supplier' }}
          </dt>
          <dd class="font-medium">
            {{ report.locationName }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Inspection date
          </dt>
          <dd class="font-medium">
            {{ formatDateMY(report.inspectionDate) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            PO / reference
          </dt>
          <dd class="font-medium">
            {{ report.reference || '-' }}
          </dd>
        </div>
        <div class="col-span-2 sm:col-span-4">
          <dt class="text-muted">
            Products inspected
          </dt>
          <dd
            v-if="report.products.length"
            class="space-y-0.5"
            data-testid="product-list"
          >
            <p
              v-for="p in report.products"
              :key="p.productNo"
            >
              <span class="font-medium">{{ p.productNo }}</span>
              <span
                v-if="p.description"
                class="text-muted"
              > - {{ p.description }}</span>
            </p>
          </dd>
          <dd
            v-else
            class="font-medium"
          >
            -
          </dd>
        </div>
        <div
          v-if="report.notes"
          class="col-span-2 sm:col-span-4"
        >
          <dt class="text-muted">
            Notes
          </dt>
          <dd class="whitespace-pre-line">
            {{ report.notes }}
          </dd>
        </div>
      </dl>
    </UCard>

    <!-- Checklist -->
    <section
      v-for="s in sections"
      :key="s.name"
      class="space-y-3"
    >
      <h3 class="text-lg font-semibold text-highlighted">
        {{ s.name }}
      </h3>
      <InspectionReportingPointCard
        v-for="entry in s.points"
        :key="entry.point.id"
        :point="entry.point"
        :number="entry.number"
        :readonly="!canEdit"
        :photo-urls="photoUrls"
        :uploading="!!uploading[entry.point.id]"
        :highlight="highlighted.has(entry.point.id)"
        @change="change(entry.point, $event)"
        @upload="addPhotos(entry.point, $event)"
        @remove-photo="removePhoto(entry.point, $event)"
      />
    </section>

    <UAlert
      v-if="submitProblems.length"
      color="error"
      variant="subtle"
      title="Can't submit yet"
    >
      <template #description>
        <ul class="list-disc pl-5">
          <li
            v-for="p in submitProblems"
            :key="p"
          >
            {{ p }}
          </li>
        </ul>
        The points to fix are outlined in red.
      </template>
    </UAlert>

    <!-- History -->
    <UCard data-testid="history">
      <template #header>
        <h3 class="font-semibold">
          History
        </h3>
      </template>
      <ol class="space-y-3 text-sm">
        <li
          v-for="e in report.events"
          :key="e.id"
        >
          <p>
            <span class="font-medium">{{ eventLabels[e.action] ?? e.action }}</span>
            <span class="text-muted"> · {{ e.actorName }} · {{ when(e.createdAt) }}</span>
          </p>
          <p
            v-if="e.comment"
            class="mt-0.5 whitespace-pre-line text-muted"
          >
            "{{ e.comment }}"
          </p>
        </li>
      </ol>
    </UCard>

    <!-- Summary and actions -->
    <div class="sticky bottom-0 z-10 -mx-4 border-t border-default bg-default/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div
          class="text-sm"
          data-testid="summary"
        >
          <p class="font-medium">
            {{ answered }} of {{ tally.total }} answered
            <UBadge
              v-if="answered > 0"
              class="ml-1"
              :color="overallColor[overall]"
              variant="subtle"
              :label="`${INSPECTION_OVERALL_LABELS[overall]}${report.overallIsFinal ? '' : ' so far'}`"
            />
          </p>
          <p class="text-muted">
            {{ tally.compliant }} compliant · {{ tally.minor }} minor · {{ tally.major }} major · {{ tally.na }} N/A
          </p>
        </div>
        <div
          v-if="canEdit"
          class="flex flex-wrap items-center gap-2"
        >
          <span
            v-if="dirty"
            class="text-sm text-warning"
          >Unsaved changes</span>
          <UButton
            variant="outline"
            color="neutral"
            icon="i-lucide-save"
            label="Save draft"
            :loading="saving"
            :disabled="!dirty"
            data-testid="save-draft"
            @click="save()"
          />
          <UButton
            icon="i-lucide-send"
            label="Submit for review"
            :disabled="saving"
            data-testid="submit-review"
            @click="askSubmit"
          />
        </div>
        <div
          v-else-if="report.can.review"
          class="flex flex-wrap items-center gap-2"
        >
          <UButton
            variant="outline"
            color="warning"
            icon="i-lucide-undo-2"
            label="Send back"
            data-testid="send-back"
            @click="startReview('return')"
          />
          <UButton
            icon="i-lucide-check-check"
            label="Close report"
            data-testid="close-report"
            @click="startReview('close')"
          />
        </div>
      </div>
    </div>

    <UModal
      v-model:open="confirmOpen"
      title="Submit for review?"
    >
      <template #body>
        <UAlert
          v-if="hasNonConformance(tally)"
          class="mb-3"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="This report has non-conformances"
          :description="`${tally.minor} minor and ${tally.major} major. The result is currently: ${INSPECTION_OVERALL_LABELS[overall]}.`"
          data-testid="nc-warning"
        />
        <p class="text-sm">
          Once submitted you can't edit the report unless a reviewer sends it back.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Keep editing"
            color="neutral"
            variant="outline"
            :disabled="submitting"
            @click="confirmOpen = false"
          />
          <UButton
            label="Submit"
            :loading="submitting"
            data-testid="confirm-submit"
            @click="submit"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="leaveOpen"
      title="Leave without saving?"
      description="You have changes that haven't been saved."
    >
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton
            label="Stay on this page"
            color="neutral"
            variant="outline"
            data-testid="leave-stay"
            @click="decideLeave(false)"
          />
          <UButton
            label="Leave without saving"
            color="error"
            variant="outline"
            data-testid="leave-discard"
            @click="decideLeave(true)"
          />
          <UButton
            label="Save and leave"
            :loading="saving"
            data-testid="leave-save"
            @click="saveAndLeave"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="discardOpen"
      :title="report.status === 'draft' ? 'Discard this draft?' : 'Delete this report?'"
      :description="`Report #${report.id} for ${report.locationName}`"
    >
      <template #body>
        <p class="text-sm">
          The {{ report.status === 'draft' ? 'draft' : 'report' }}, its answers, photos and history will be permanently deleted. This can't be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Keep it"
            color="neutral"
            variant="outline"
            :disabled="discarding"
            @click="discardOpen = false"
          />
          <UButton
            :label="report.status === 'draft' ? 'Discard draft' : 'Delete report'"
            color="error"
            :loading="discarding"
            data-testid="confirm-discard"
            @click="discard"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="reviewOpen"
      :title="reviewAction === 'close' ? 'Close this report?' : 'Send back to the inspector?'"
      :description="`Report #${report.id} for ${report.locationName}`"
    >
      <template #body>
        <div class="space-y-3">
          <UAlert
            v-if="reviewAction === 'close'"
            :color="overallColor[overall]"
            variant="subtle"
            icon="i-lucide-clipboard-check"
            :title="`The result will be final: ${INSPECTION_OVERALL_LABELS[overall]}`"
            :description="`${tally.compliant} compliant, ${tally.minor} minor and ${tally.major} major non-conformances, ${tally.na} N/A. A closed report can't be changed.`"
            data-testid="close-summary"
          />
          <p
            v-else
            class="text-sm"
          >
            The report goes back to a draft so the inspector can fix it and submit it again.
          </p>
          <UFormField
            :label="reviewAction === 'close' ? 'Comment (optional)' : 'What needs changing?'"
            :required="reviewAction === 'return'"
          >
            <UTextarea
              v-model="reviewComment"
              :rows="3"
              autoresize
              maxlength="2000"
              class="w-full"
              data-testid="review-comment"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :disabled="reviewing"
            @click="reviewAction = null"
          />
          <UButton
            :label="reviewAction === 'close' ? 'Close report' : 'Send back'"
            :color="reviewAction === 'close' ? 'primary' : 'warning'"
            :loading="reviewing"
            data-testid="confirm-review"
            @click="review"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
