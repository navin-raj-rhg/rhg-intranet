<script setup lang="ts">
import type { InspectionPointView } from '~~/shared/types/inspection'
import type { InspectionPointResult, InspectionSeverity } from '~~/shared/utils/inspectionRules'

/**
 * One inspection point (Step 12.8): the wording, Compliant / Non-Conformance /
 * N/A, a comment and photos. Choosing Non-Conformance opens a dialog (for now
 * it only asks Minor or Major - the rest is to be decided). The card never
 * changes its own data: it reports changes to the report editor.
 */

const props = defineProps<{
  point: InspectionPointView
  number: string
  readonly: boolean
  photoUrls: Record<number, string>
  uploading: boolean
  highlight?: boolean
}>()

const emit = defineEmits<{
  change: [patch: { result?: InspectionPointResult | null, severity?: InspectionSeverity | null, comment?: string | null }]
  upload: [files: File[]]
  removePhoto: [photoId: number]
}>()

const libraryInput = ref<HTMLInputElement>()
const cameraInput = ref<HTMLInputElement>()
const brokenPhotos = ref<Record<number, boolean>>({})

/* ---- answer buttons ---- */

function choose(result: 'compliant' | 'na') {
  // Choosing the same answer again clears it.
  if (props.point.result === result) emit('change', { result: null, severity: null })
  else emit('change', { result, severity: null })
}

/* ---- Non-Conformance dialog ---- */

const ncOpen = ref(false)
const pendingSeverity = ref<InspectionSeverity | null>(null)

function openNc() {
  pendingSeverity.value = props.point.result === 'non_conformance' ? props.point.severity : null
  ncOpen.value = true
}

function confirmNc() {
  if (!pendingSeverity.value) return
  emit('change', { result: 'non_conformance', severity: pendingSeverity.value })
  ncOpen.value = false
}

const severityOptions: { value: InspectionSeverity, label: string }[] = [
  { value: 'minor', label: 'Minor' },
  { value: 'major', label: 'Major' }
]

/* ---- photos ---- */

function picked(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length) emit('upload', files)
}
</script>

<template>
  <UCard
    :id="`point-${point.id}`"
    :ui="{ body: 'space-y-3' }"
    :class="highlight ? 'ring-2 ring-error' : ''"
    :data-testid="`point-${point.id}`"
  >
    <div class="flex items-start gap-3">
      <span class="w-8 shrink-0 pt-0.5 text-right text-sm text-muted">{{ number }}</span>
      <p class="flex-1 font-medium text-highlighted">
        {{ point.pointText }}
      </p>
    </div>

    <!-- Answer -->
    <div
      v-if="!readonly"
      class="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      <UButton
        block
        class="order-1"
        color="success"
        :variant="point.result === 'compliant' ? 'solid' : 'outline'"
        icon="i-lucide-check"
        label="Compliant"
        data-testid="answer-compliant"
        @click="choose('compliant')"
      />
      <UButton
        block
        class="order-3 col-span-2 sm:order-2 sm:col-span-1"
        color="error"
        :variant="point.result === 'non_conformance' ? 'solid' : 'outline'"
        icon="i-lucide-triangle-alert"
        label="Non-Conformance"
        data-testid="answer-nc"
        @click="openNc"
      />
      <UButton
        block
        class="order-2 sm:order-3"
        color="neutral"
        :variant="point.result === 'na' ? 'solid' : 'outline'"
        label="N/A"
        data-testid="answer-na"
        @click="choose('na')"
      />
    </div>
    <div
      v-else
      class="flex"
    >
      <UBadge
        v-if="point.result === 'compliant'"
        color="success"
        variant="subtle"
        label="Compliant"
      />
      <UBadge
        v-else-if="point.result === 'na'"
        color="neutral"
        variant="subtle"
        label="N/A"
      />
      <UBadge
        v-else-if="point.result === 'non_conformance'"
        color="error"
        variant="subtle"
        :label="`Non-Conformance${point.severity ? ' - ' + (point.severity === 'major' ? 'Major' : 'Minor') : ''}`"
      />
      <span
        v-else
        class="text-sm text-dimmed"
      >Not answered</span>
    </div>

    <p
      v-if="!readonly && point.result === 'non_conformance' && point.severity"
      class="flex items-center gap-2 text-sm"
    >
      <UBadge
        :color="point.severity === 'major' ? 'error' : 'warning'"
        variant="subtle"
        :label="point.severity === 'major' ? 'Major' : 'Minor'"
      />
      <button
        type="button"
        class="text-primary underline"
        @click="openNc"
      >
        Change
      </button>
    </p>

    <!-- Comment -->
    <UTextarea
      v-if="!readonly"
      :model-value="point.comment ?? ''"
      :rows="2"
      autoresize
      maxlength="4000"
      placeholder="Comments"
      class="w-full"
      aria-label="Comments"
      data-testid="point-comment"
      @update:model-value="emit('change', { comment: String($event) })"
    />
    <p
      v-else-if="point.comment"
      class="text-sm whitespace-pre-line"
    >
      {{ point.comment }}
    </p>

    <!-- Photos -->
    <div
      v-if="point.photos.length || !readonly"
      class="flex flex-wrap items-center gap-2"
    >
      <div
        v-for="ph in point.photos"
        :key="ph.id"
        class="relative"
        :data-testid="`photo-${ph.id}`"
      >
        <a
          :href="photoUrls[ph.id]"
          target="_blank"
          rel="noopener"
          class="flex size-20 items-center justify-center overflow-hidden rounded-md border border-default bg-elevated"
          :title="ph.fileName"
        >
          <img
            v-if="photoUrls[ph.id] && !brokenPhotos[ph.id]"
            :src="photoUrls[ph.id]"
            :alt="ph.fileName"
            class="size-full object-cover"
            @error="brokenPhotos[ph.id] = true"
          >
          <UIcon
            v-else
            name="i-lucide-image"
            class="size-6 text-muted"
          />
        </a>
        <button
          v-if="!readonly"
          type="button"
          class="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-error text-white shadow"
          :aria-label="`Remove photo ${ph.fileName}`"
          @click="emit('removePhoto', ph.id)"
        >
          <UIcon
            name="i-lucide-x"
            class="size-4"
          />
        </button>
      </div>

      <template v-if="!readonly">
        <!-- Camera: opens the phone's camera straight away (on a computer it opens the normal file box). -->
        <input
          ref="cameraInput"
          type="file"
          accept="image/*"
          capture="environment"
          class="hidden"
          data-testid="photo-camera-input"
          @change="picked"
        >
        <!-- Library: pick one or more existing photos. -->
        <input
          ref="libraryInput"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          data-testid="photo-input"
          @change="picked"
        >
        <UButton
          variant="outline"
          color="neutral"
          icon="i-lucide-camera"
          label="Take photo"
          :loading="uploading"
          data-testid="take-photo"
          @click="cameraInput?.click()"
        />
        <UButton
          variant="outline"
          color="neutral"
          icon="i-lucide-images"
          label="Choose photos"
          :disabled="uploading"
          data-testid="choose-photos"
          @click="libraryInput?.click()"
        />
      </template>
    </div>

    <UModal
      v-model:open="ncOpen"
      title="Non-Conformance"
      :description="point.pointText"
    >
      <template #body>
        <p class="mb-3 text-sm font-medium">
          How serious is it?
        </p>
        <div class="grid grid-cols-2 gap-3">
          <UButton
            v-for="o in severityOptions"
            :key="o.value"
            block
            size="lg"
            :color="o.value === 'major' ? 'error' : 'warning'"
            :variant="pendingSeverity === o.value ? 'solid' : 'outline'"
            :label="o.label"
            :data-testid="`severity-${o.value}`"
            @click="pendingSeverity = o.value"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="ncOpen = false"
          />
          <UButton
            label="Confirm"
            :disabled="!pendingSeverity"
            data-testid="severity-confirm"
            @click="confirmNc"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
