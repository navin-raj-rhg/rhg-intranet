<script setup lang="ts">
import type { CostSetupResponse } from '~~/shared/types/costModelling'

/**
 * Setup tab (Step 13.6b, admins and the owner): look after the lists behind
 * Cost Modelling - rename, merge and delete categories and sub-categories, add
 * ports, add local-cost charge lines, and switch ports and charge lines off.
 * Saved models are never rewritten: they keep their own frozen Factors,
 * figures and names.
 */
const toast = useToast()

const { data, error, refresh } = await useAsyncData('cost-modelling-setup', () =>
  useApiFetch<CostSetupResponse>('/api/tools/cost-modelling/setup')
)

const api = '/api/tools/cost-modelling'
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Other screens hold copies of these lists, so tell them to reload. */
async function refreshAll(alsoFactors: boolean) {
  await refresh()
  await refreshNuxtData('cost-modelling-categories')
  if (alsoFactors) await refreshNuxtData('cost-modelling-factors')
}

const busy = ref(false)

async function run(task: () => Promise<unknown>, success: string, opts: { alsoFactors?: boolean, failTitle?: string } = {}) {
  busy.value = true
  try {
    await task()
    toast.add({ title: success, color: 'success' })
    await refreshAll(!!opts.alsoFactors)
    return true
  } catch (err) {
    toast.add({ title: opts.failTitle ?? 'Could not save the change', description: errorText(err), color: 'error' })
    return false
  } finally {
    busy.value = false
  }
}

/* ------------------------------------------------------------------ */
/* Rename dialog                                                       */
/* ------------------------------------------------------------------ */

type RenameKind = 'category' | 'sub-category' | 'port' | 'charge line'
const renameDlg = reactive({ open: false, kind: 'category' as RenameKind, id: 0, value: '' })

const RENAME_URL: Record<RenameKind, string> = {
  'category': `${api}/categories`,
  'sub-category': `${api}/sub-categories`,
  'port': `${api}/ports`,
  'charge line': `${api}/fee-types`
}

function startRename(kind: RenameKind, id: number, current: string) {
  Object.assign(renameDlg, { open: true, kind, id, value: current })
}

async function saveRename() {
  const ok = await run(
    () => useApiFetch(`${RENAME_URL[renameDlg.kind]}/${renameDlg.id}`, { method: 'PATCH', body: { name: renameDlg.value } }),
    `Renamed ${renameDlg.kind}`,
    { alsoFactors: renameDlg.kind === 'port' || renameDlg.kind === 'charge line' }
  )
  if (ok) renameDlg.open = false
}

/* ------------------------------------------------------------------ */
/* Merge dialog                                                        */
/* ------------------------------------------------------------------ */

const mergeDlg = reactive({
  open: false,
  kind: 'category' as 'category' | 'sub-category',
  id: 0,
  name: '',
  intoId: undefined as number | undefined,
  options: [] as { label: string, value: number }[]
})

function startMerge(kind: 'category' | 'sub-category', id: number, name: string, siblings: { id: number, name: string }[]) {
  Object.assign(mergeDlg, {
    open: true,
    kind,
    id,
    name,
    intoId: undefined,
    options: siblings.filter(s => s.id !== id).map(s => ({ label: s.name, value: s.id }))
  })
}

const mergeTarget = computed(() => mergeDlg.options.find(o => o.value === mergeDlg.intoId)?.label)

async function doMerge() {
  if (!mergeDlg.intoId) return
  const base = mergeDlg.kind === 'category' ? 'categories' : 'sub-categories'
  const ok = await run(
    () => useApiFetch(`${api}/${base}/${mergeDlg.id}/merge`, { method: 'POST', body: { intoId: mergeDlg.intoId } }),
    `Merged "${mergeDlg.name}" into "${mergeTarget.value}"`,
    { failTitle: 'Could not merge' }
  )
  if (ok) mergeDlg.open = false
}

/* ------------------------------------------------------------------ */
/* Confirm dialog (delete, switch off)                                 */
/* ------------------------------------------------------------------ */

const confirmDlg = reactive({
  open: false,
  title: '',
  text: '',
  label: '',
  color: 'error' as 'error' | 'warning' | 'primary',
  task: null as null | (() => Promise<unknown>),
  success: '',
  alsoFactors: false
})

function askConfirm(c: { title: string, text: string, label: string, color?: 'error' | 'warning' | 'primary', success: string, alsoFactors?: boolean, task: () => Promise<unknown> }) {
  Object.assign(confirmDlg, { open: true, color: 'error', alsoFactors: false, ...c })
}

async function doConfirm() {
  if (!confirmDlg.task) return
  const ok = await run(confirmDlg.task, confirmDlg.success, { alsoFactors: confirmDlg.alsoFactors })
  if (ok) confirmDlg.open = false
}

function deleteCategory(c: CostSetupResponse['categories'][number]) {
  askConfirm({
    title: `Delete category "${c.name}"?`,
    text: c.modelCount
      ? `${plural(c.modelCount, 'saved cost model')} use it, so it can't be deleted. Use Merge to move them into another category.`
      : 'It is not used by any saved cost model. Its sub-categories are deleted with it.',
    label: 'Delete category',
    success: `Deleted category "${c.name}"`,
    task: () => useApiFetch(`${api}/categories/${c.id}`, { method: 'DELETE' })
  })
}

function deleteSubCategory(s: { id: number, name: string, modelCount: number }) {
  askConfirm({
    title: `Delete sub-category "${s.name}"?`,
    text: s.modelCount
      ? `${plural(s.modelCount, 'saved cost model')} use it, so it can't be deleted. Use Merge to move them into another sub-category.`
      : 'It is not used by any saved cost model.',
    label: 'Delete sub-category',
    success: `Deleted sub-category "${s.name}"`,
    task: () => useApiFetch(`${api}/sub-categories/${s.id}`, { method: 'DELETE' })
  })
}

function switchOffPort(p: CostSetupResponse['ports'][number]) {
  askConfirm({
    title: `Switch off ${p.code} - ${p.name}?`,
    text: p.kind === 'origin'
      ? 'It will no longer be offered as a ship-from port for new cost models. Saved models keep it, and you can switch it back on at any time.'
      : 'It will disappear from the Factors tab and from new cost models. Saved models keep it, and you can switch it back on at any time.',
    label: 'Switch off',
    color: 'warning',
    success: `Switched off ${p.code}`,
    alsoFactors: true,
    task: () => useApiFetch(`${api}/ports/${p.id}`, { method: 'PATCH', body: { active: false } })
  })
}

function switchOffFee(f: CostSetupResponse['feeTypes'][number]) {
  askConfirm({
    title: `Switch off "${f.name}"?`,
    text: 'It will disappear from the Factors tab and from new cost models, so it stops counting towards local costs. Saved models keep it, and you can switch it back on at any time.',
    label: 'Switch off',
    color: 'warning',
    success: `Switched off "${f.name}"`,
    alsoFactors: true,
    task: () => useApiFetch(`${api}/fee-types/${f.id}`, { method: 'PATCH', body: { active: false } })
  })
}

/** Switching back on needs no confirmation. */
const switchOn = (kind: 'ports' | 'fee-types', id: number, label: string) =>
  run(() => useApiFetch(`${api}/${kind}/${id}`, { method: 'PATCH', body: { active: true } }), `Switched on ${label}`, { alsoFactors: true })

/* ------------------------------------------------------------------ */
/* Add port / charge line                                              */
/* ------------------------------------------------------------------ */

const newPort = reactive({ kind: 'destination' as 'origin' | 'destination', code: '', name: '' })
const portKinds = [
  { label: 'AU port (destination)', value: 'destination' },
  { label: 'Ship-from port (China)', value: 'origin' }
]
const newPortProblem = computed(() => (newPort.code ? portCodeProblem(newPort.code) : ''))

async function addPort() {
  const ok = await run(
    () => useApiFetch(`${api}/ports`, { method: 'POST', body: { ...newPort } }),
    `Added port ${tidyPortCode(newPort.code)}. Fill in its freight and local costs on the Factors tab.`,
    { alsoFactors: true, failTitle: 'Could not add the port' }
  )
  if (ok) Object.assign(newPort, { code: '', name: '' })
}

const newFee = ref('')

async function addFee() {
  const ok = await run(
    () => useApiFetch(`${api}/fee-types`, { method: 'POST', body: { name: newFee.value } }),
    `Added "${tidyCostName(newFee.value)}". It starts at 0 for every AU port - fill it in on the Factors tab.`,
    { alsoFactors: true, failTitle: 'Could not add the charge line' }
  )
  if (ok) newFee.value = ''
}

const ports = (kind: 'origin' | 'destination') => (data.value?.ports ?? []).filter(p => p.kind === kind)
</script>

<template>
  <div class="mt-6 space-y-8">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load the setup lists"
      :description="errorText(error)"
    />

    <template v-else-if="data">
      <p class="text-sm text-muted">
        Changes here never alter saved cost models: they keep the Factors, figures and names they were saved with.
      </p>

      <!-- Categories -->
      <UCard>
        <template #header>
          <span class="font-medium">Categories and sub-categories</span>
        </template>

        <p
          v-if="!data.categories.length"
          class="text-sm text-muted"
        >
          No categories yet. They are added when a cost model is created.
        </p>

        <div
          v-for="c in data.categories"
          :key="c.id"
          class="border-b border-default py-3 last:border-b-0"
          :data-testid="`category-${c.id}`"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="font-medium">
              {{ c.name }}
              <span class="ml-1 text-xs font-normal text-muted">{{ plural(c.modelCount, 'model') }}</span>
            </p>
            <div class="flex gap-1">
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                label="Rename"
                @click="startRename('category', c.id, c.name)"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                label="Merge"
                :disabled="data.categories.length < 2"
                @click="startMerge('category', c.id, c.name, data.categories)"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                label="Delete"
                @click="deleteCategory(c)"
              />
            </div>
          </div>

          <div
            v-for="s in c.subCategories"
            :key="s.id"
            class="mt-2 ml-5 flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <p>
              {{ s.name }}
              <span class="ml-1 text-xs text-muted">{{ plural(s.modelCount, 'model') }}</span>
            </p>
            <div class="flex gap-1">
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                label="Rename"
                @click="startRename('sub-category', s.id, s.name)"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                label="Merge"
                :disabled="c.subCategories.length < 2"
                @click="startMerge('sub-category', s.id, s.name, c.subCategories)"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                label="Delete"
                @click="deleteSubCategory(s)"
              />
            </div>
          </div>
        </div>
      </UCard>

      <!-- Ports -->
      <UCard>
        <template #header>
          <span class="font-medium">Ports</span>
        </template>

        <div
          v-for="group in [{ kind: 'origin' as const, title: 'Ship-from ports (China)' }, { kind: 'destination' as const, title: 'AU ports' }]"
          :key="group.kind"
          class="mb-4"
        >
          <p class="mb-1 text-xs tracking-wide text-muted uppercase">
            {{ group.title }}
          </p>
          <div
            v-for="p in ports(group.kind)"
            :key="p.id"
            class="flex flex-wrap items-center justify-between gap-2 border-b border-default py-2 last:border-b-0"
            :data-testid="`port-${p.code}`"
          >
            <p :class="p.active ? '' : 'text-muted'">
              <span class="font-medium">{{ p.code }}</span> - {{ p.name }}
              <UBadge
                v-if="!p.active"
                class="ml-2"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Switched off
              </UBadge>
              <span
                v-if="p.kind === 'origin'"
                class="ml-1 text-xs text-muted"
              >{{ plural(p.modelCount, 'model') }}</span>
            </p>
            <div class="flex gap-1">
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                label="Rename"
                @click="startRename('port', p.id, p.name)"
              />
              <UButton
                v-if="p.active"
                size="xs"
                variant="ghost"
                color="warning"
                label="Switch off"
                @click="switchOffPort(p)"
              />
              <UButton
                v-else
                size="xs"
                variant="ghost"
                label="Switch on"
                :loading="busy"
                @click="switchOn('ports', p.id, p.code)"
              />
            </div>
          </div>
        </div>

        <form
          class="mt-4 grid grid-cols-1 items-end gap-3 border-t border-default pt-4 sm:grid-cols-[14rem_7rem_1fr_auto]"
          @submit.prevent="addPort"
        >
          <UFormField label="Add a port">
            <USelect
              v-model="newPort.kind"
              :items="portKinds"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Code"
            :error="newPortProblem || undefined"
          >
            <UInput
              v-model="newPort.code"
              placeholder="HBA"
              maxlength="8"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Name">
            <UInput
              v-model="newPort.name"
              placeholder="Hobart"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            label="Add port"
            icon="i-lucide-plus"
            :loading="busy"
            :disabled="!newPort.code || !newPort.name || !!newPortProblem"
          />
        </form>
        <p class="mt-2 text-xs text-muted">
          A new port starts with zero freight and local costs - fill them in on the Factors tab.
        </p>
      </UCard>

      <!-- Charge lines -->
      <UCard>
        <template #header>
          <span class="font-medium">Local-cost charge lines</span>
        </template>

        <div
          v-for="f in data.feeTypes"
          :key="f.id"
          class="flex flex-wrap items-center justify-between gap-2 border-b border-default py-2 last:border-b-0"
          :data-testid="`fee-${f.id}`"
        >
          <p :class="f.active ? '' : 'text-muted'">
            {{ f.name }}
            <UBadge
              v-if="!f.active"
              class="ml-2"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              Switched off
            </UBadge>
          </p>
          <div class="flex gap-1">
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              label="Rename"
              @click="startRename('charge line', f.id, f.name)"
            />
            <UButton
              v-if="f.active"
              size="xs"
              variant="ghost"
              color="warning"
              label="Switch off"
              @click="switchOffFee(f)"
            />
            <UButton
              v-else
              size="xs"
              variant="ghost"
              label="Switch on"
              :loading="busy"
              @click="switchOn('fee-types', f.id, f.name)"
            />
          </div>
        </div>

        <form
          class="mt-4 flex flex-wrap items-end gap-3 border-t border-default pt-4"
          @submit.prevent="addFee"
        >
          <UFormField
            label="Add a charge line"
            class="min-w-64 flex-1"
          >
            <UInput
              v-model="newFee"
              placeholder="e.g. Demurrage"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            label="Add charge line"
            icon="i-lucide-plus"
            :loading="busy"
            :disabled="!newFee.trim()"
          />
        </form>
        <p class="mt-2 text-xs text-muted">
          A new charge line starts at 0 for every AU port - fill it in on the Factors tab.
        </p>
      </UCard>
    </template>

    <!-- Rename -->
    <UModal
      v-model:open="renameDlg.open"
      :title="`Rename ${renameDlg.kind}`"
    >
      <template #body>
        <form
          id="rename-form"
          @submit.prevent="saveRename"
        >
          <UFormField label="New name">
            <UInput
              v-model="renameDlg.value"
              class="w-full"
              autofocus
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :disabled="busy"
            @click="renameDlg.open = false"
          />
          <UButton
            type="submit"
            form="rename-form"
            label="Save"
            :loading="busy"
            :disabled="!renameDlg.value.trim()"
          />
        </div>
      </template>
    </UModal>

    <!-- Merge -->
    <UModal
      v-model:open="mergeDlg.open"
      :title="`Merge ${mergeDlg.kind}: ${mergeDlg.name}`"
    >
      <template #body>
        <UFormField label="Merge into">
          <USelect
            v-model="mergeDlg.intoId"
            :items="mergeDlg.options"
            placeholder="Choose where everything should go"
            class="w-full"
          />
        </UFormField>
        <p
          v-if="mergeTarget"
          class="mt-3 text-sm"
        >
          Every saved cost model{{ mergeDlg.kind === 'category' ? ' and sub-category' : '' }} in "{{ mergeDlg.name }}"
          moves to "{{ mergeTarget }}", and "{{ mergeDlg.name }}" is removed. Saved model names stay as they were saved.
          This can't be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :disabled="busy"
            @click="mergeDlg.open = false"
          />
          <UButton
            label="Merge"
            color="warning"
            :loading="busy"
            :disabled="!mergeDlg.intoId"
            @click="doMerge"
          />
        </div>
      </template>
    </UModal>

    <!-- Delete / switch off -->
    <UModal
      v-model:open="confirmDlg.open"
      :title="confirmDlg.title"
    >
      <template #body>
        <p class="text-sm">
          {{ confirmDlg.text }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :disabled="busy"
            @click="confirmDlg.open = false"
          />
          <UButton
            :label="confirmDlg.label"
            :color="confirmDlg.color"
            :loading="busy"
            @click="doConfirm"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
