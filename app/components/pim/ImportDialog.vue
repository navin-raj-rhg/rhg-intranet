<script setup lang="ts">
import type { PimImportResponse } from '~~/shared/types/pim'
import { PIM_CSV_COLUMNS, pimCsvTemplate } from '~~/shared/utils/pimRules'

/**
 * CSV import (Step 17.9, editors and admins). Two steps: the file is checked
 * first and every problem is listed by spreadsheet row; only when it is clean
 * can the person import. All rows are saved or none.
 */

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ imported: [] }>()
const toast = useToast()

const picker = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const csv = ref('')
const checking = ref(false)
const importing = ref(false)
const result = ref<PimImportResponse | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) reset()
})

function reset() {
  fileName.value = ''
  csv.value = ''
  result.value = null
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  reset()
  if (file.size > 5 * 1024 * 1024) {
    toast.add({ title: 'That file is too big', description: 'Import at most 5 MB (about 2,000 products) at a time.', color: 'warning' })
    return
  }
  fileName.value = file.name
  csv.value = await file.text()
  await run(false)
}

async function run(apply: boolean) {
  const busy = apply ? importing : checking
  busy.value = true
  try {
    result.value = await useApiFetch<PimImportResponse>('/api/tools/pim/products/import', { method: 'POST', body: { csv: csv.value, apply } })
    if (result.value.applied) {
      toast.add({
        title: 'Import finished',
        description: `${result.value.created} added, ${result.value.updated} updated.`,
        color: 'success'
      })
      emit('imported')
      open.value = false
    }
  } catch (err) {
    toast.add({ title: apply ? 'Couldn\'t import' : 'Couldn\'t check the file', description: errorText(err), color: 'error' })
  } finally {
    busy.value = false
  }
}

function downloadTemplate() {
  // A leading byte-order mark makes Excel read accented characters correctly.
  const bom = String.fromCharCode(0xFEFF)
  const url = URL.createObjectURL(new Blob([bom + pimCsvTemplate()], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'product-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const clean = computed(() => result.value && !result.value.problems.length)
const nothingToDo = computed(() => clean.value && result.value!.created + result.value!.updated === 0)
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import products from a CSV file"
  >
    <template #body>
      <div class="space-y-4 text-sm">
        <div class="space-y-1 text-muted">
          <p>
            Columns: {{ PIM_CSV_COLUMNS.join(', ') }}. Only <strong>Product number</strong> and <strong>Name</strong> are required.
          </p>
          <ul class="list-disc space-y-1 pl-5">
            <li>A product number that already exists <strong>updates</strong> that product; a new one adds a product.</li>
            <li>A blank cell never erases what is already saved.</li>
            <li>Categories and sub-categories must already exist (an admin adds them first).</li>
            <li>Several suppliers go in one cell separated by <code>;</code>, with their code after a colon, like <code>Acme: A-1; Beta</code>. The first is the primary one.</li>
            <li>Images, documents, packaging and attributes aren't imported - add them on the product.</li>
            <li>If any row has a problem, nothing is imported.</li>
          </ul>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <input
            ref="picker"
            type="file"
            accept=".csv,text/csv"
            class="hidden"
            data-testid="import-input"
            @change="onPick"
          >
          <UButton
            icon="i-lucide-file-up"
            label="Choose CSV file"
            :loading="checking"
            @click="picker?.click()"
          />
          <UButton
            icon="i-lucide-download"
            variant="outline"
            color="neutral"
            label="Download template"
            @click="downloadTemplate"
          />
          <span
            v-if="fileName"
            class="break-all text-muted"
          >{{ fileName }}</span>
        </div>

        <UAlert
          v-if="result && result.problems.length"
          color="error"
          variant="subtle"
          :title="`${result.problems.length} problem${result.problems.length === 1 ? '' : 's'} found - nothing was imported`"
        >
          <template #description>
            <p class="mb-1">
              Fix these in the file, then choose it again.
            </p>
            <ul
              class="max-h-60 list-disc space-y-1 overflow-y-auto pl-5"
              data-testid="import-problems"
            >
              <li
                v-for="(p, i) in result.problems"
                :key="i"
              >
                {{ p }}
              </li>
            </ul>
          </template>
        </UAlert>

        <UAlert
          v-else-if="clean"
          :color="nothingToDo ? 'neutral' : 'success'"
          variant="subtle"
          :title="nothingToDo ? 'Nothing to import' : 'The file looks good'"
          :description="nothingToDo ? 'The file has no products.' : `This will add ${result!.created} new product${result!.created === 1 ? '' : 's'} and update ${result!.updated} existing one${result!.updated === 1 ? '' : 's'}.`"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Close"
          color="neutral"
          variant="outline"
          :disabled="importing"
          @click="open = false"
        />
        <UButton
          v-if="clean && !nothingToDo"
          :label="`Import ${result!.created + result!.updated} product${result!.created + result!.updated === 1 ? '' : 's'}`"
          icon="i-lucide-check"
          :loading="importing"
          data-testid="import-apply"
          @click="run(true)"
        />
      </div>
    </template>
  </UModal>
</template>
