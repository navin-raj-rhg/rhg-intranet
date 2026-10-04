<script setup lang="ts">
/**
 * One upload panel for Manage chart data (Step 19.5): choose a CSV, check it,
 * then replace the chart's data. Used for Sales and for Goals.
 */
interface UploadInfo {
  fileName: string
  rowCount: number
  uploadedAt: string
  uploadedBy: string | null
}

const props = defineProps<{
  kind: 'sales' | 'goals'
  title: string
  description: string
  columns: string
  info: UploadInfo | null
}>()
const emit = defineEmits<{ uploaded: [] }>()

const toast = useToast()
const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const csvText = ref('')
const checking = ref(false)
const applying = ref(false)
const problems = ref<string[]>([])
const checkedRows = ref<number | null>(null)

function reset() {
  fileName.value = ''
  csvText.value = ''
  problems.value = []
  checkedRows.value = null
  if (fileInput.value) fileInput.value.value = ''
}

function downloadTemplate() {
  const text = props.kind === 'sales' ? salesCsvTemplate() : goalsCsvTemplate()
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.kind}-template.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function send(apply: boolean) {
  return await useApiFetch<{ rowCount: number, problems: string[], applied: boolean }>(
    `/api/admin/dashboard-data/${props.kind}`,
    { method: 'POST', body: { csv: csvText.value, fileName: fileName.value, apply } }
  )
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  problems.value = []
  checkedRows.value = null
  if (!file) return reset()
  if (file.size > 10_000_000) {
    reset()
    problems.value = ['That file is too big (10 MB at most).']
    return
  }
  fileName.value = file.name
  csvText.value = await file.text()
  checking.value = true
  try {
    const result = await send(false)
    problems.value = result.problems
    checkedRows.value = result.problems.length ? null : result.rowCount
  } catch (err) {
    problems.value = [errorText(err)]
  } finally {
    checking.value = false
  }
}

async function apply() {
  applying.value = true
  try {
    const result = await send(true)
    if (result.problems.length) {
      problems.value = result.problems
      return
    }
    toast.add({ title: `Replaced the ${props.kind} data with ${result.rowCount} rows`, color: 'success' })
    reset()
    emit('uploaded')
  } catch (err) {
    toast.add({ title: errorText(err), color: 'error' })
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <UCard :data-testid="`upload-${kind}`">
    <template #header>
      <span class="font-medium">{{ title }}</span>
    </template>

    <p class="text-sm text-muted">
      {{ description }}
    </p>
    <p class="mt-2 text-sm">
      <span class="font-medium">Columns:</span> {{ columns }}
    </p>

    <p
      class="mt-3 text-sm"
      :data-testid="`last-upload-${kind}`"
    >
      <template v-if="info">
        Last uploaded {{ formatDateTimeMY(new Date(info.uploadedAt)) }}<template v-if="info.uploadedBy">
          by {{ info.uploadedBy }}
        </template>:
        {{ info.fileName }} ({{ info.rowCount }} rows).
      </template>
      <span
        v-else
        class="text-muted"
      >No data uploaded yet.</span>
    </p>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <UButton
        icon="i-lucide-download"
        label="Download template"
        variant="outline"
        color="neutral"
        @click="downloadTemplate"
      />
      <input
        ref="fileInput"
        type="file"
        accept=".csv,text/csv"
        class="block max-w-full text-sm file:mr-3 file:rounded-md file:border file:border-default file:bg-elevated file:px-3 file:py-1.5 file:text-sm"
        :data-testid="`file-${kind}`"
        @change="onFile"
      >
    </div>

    <p
      v-if="checking"
      class="mt-4 text-sm text-muted"
    >
      Checking the file…
    </p>

    <UAlert
      v-if="problems.length"
      class="mt-4"
      color="error"
      variant="subtle"
      title="The file can't be used yet"
      :data-testid="`problems-${kind}`"
    >
      <template #description>
        <ul class="list-disc pl-5">
          <li
            v-for="p in problems"
            :key="p"
          >
            {{ p }}
          </li>
        </ul>
      </template>
    </UAlert>

    <div
      v-if="checkedRows !== null"
      class="mt-4"
      :data-testid="`ready-${kind}`"
    >
      <UAlert
        color="success"
        variant="subtle"
        :title="`${fileName} looks good: ${checkedRows} rows`"
        :description="info ? 'Uploading replaces everything currently shown in this chart.' : 'Nothing is saved until you press the button.'"
      />
      <UButton
        class="mt-3"
        icon="i-lucide-upload"
        label="Upload and replace"
        :loading="applying"
        :data-testid="`apply-${kind}`"
        @click="apply"
      />
    </div>
  </UCard>
</template>
