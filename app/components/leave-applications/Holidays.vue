<script setup lang="ts">
/**
 * Owner-only card: the company's public holidays. A holiday on a working day is
 * skipped when leave days are counted (a Mon-Fri request over a Wednesday
 * holiday is 4 days, not 5) and is marked on the team calendar. Changes only
 * affect leave applied for from now on - saved leave keeps the holidays it was
 * made with, so nobody's balance shifts.
 */
interface Holiday {
  id: number
  date: string
  name: string
}

const toast = useToast()

const { data: holidays, refresh } = await useAsyncData('leave-public-holidays', () =>
  useApiFetch<Holiday[]>('/api/admin/leave/holidays')
)

/** Other screens hold their own copy of the list. */
async function refreshAll() {
  await refresh()
  await Promise.all([
    refreshNuxtData('leave-team-calendar-holidays'),
    refreshNuxtData('dashboard-away-today-holiday')
  ])
}

const byYear = computed(() => {
  const groups = new Map<string, Holiday[]>()
  for (const h of holidays.value ?? []) {
    const year = h.date.slice(0, 4)
    groups.set(year, [...(groups.get(year) ?? []), h])
  }
  return [...groups].sort((a, b) => b[0].localeCompare(a[0]))
})

const busy = ref(false)

async function run(task: () => Promise<unknown>, success: string, failTitle: string) {
  busy.value = true
  try {
    await task()
    toast.add({ title: success, color: 'success' })
    await refreshAll()
    return true
  } catch (err) {
    toast.add({ title: failTitle, description: errorText(err), color: 'error' })
    return false
  } finally {
    busy.value = false
  }
}

/* ---- add ---- */
const form = reactive({ date: '', name: '' })

async function add() {
  const ok = await run(
    () => useApiFetch('/api/admin/leave/holidays', { method: 'POST', body: { date: form.date, name: form.name } }),
    `Added ${form.name.trim()}`,
    'Could not add the holiday'
  )
  if (ok) {
    form.name = ''
    // Keep the date field: holidays are usually entered one after another in date order.
  }
}

/* ---- edit ---- */
const editingId = ref<number | null>(null)
const edit = reactive({ date: '', name: '' })

function startEdit(h: Holiday) {
  editingId.value = h.id
  edit.date = h.date
  edit.name = h.name
}

async function saveEdit() {
  if (editingId.value === null) return
  const id = editingId.value
  const ok = await run(
    () => useApiFetch(`/api/admin/leave/holidays/${id}`, { method: 'PUT', body: { date: edit.date, name: edit.name } }),
    'Holiday updated',
    'Could not save the holiday'
  )
  if (ok) editingId.value = null
}

/* ---- delete ---- */
const deleting = ref<Holiday | null>(null)
const deleteOpen = computed({
  get: () => !!deleting.value,
  set: (open: boolean) => {
    if (!open) deleting.value = null
  }
})

async function confirmDelete() {
  const h = deleting.value
  if (!h) return
  const ok = await run(
    () => useApiFetch(`/api/admin/leave/holidays/${h.id}`, { method: 'DELETE' }),
    `Removed ${h.name}`,
    'Could not remove the holiday'
  )
  if (ok) deleting.value = null
}
</script>

<template>
  <UCard class="mt-8">
    <template #header>
      <div>
        <p class="font-medium">
          Public holidays
        </p>
        <p class="text-sm text-muted">
          Holidays on a working day are not counted as leave and show on the team calendar. Changes only apply to
          leave applied for from now on - leave already applied for keeps the holidays it was made with.
        </p>
      </div>
    </template>

    <form
      class="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[11rem_1fr_auto]"
      @submit.prevent="add"
    >
      <UFormField label="Date">
        <UInput
          v-model="form.date"
          type="date"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Name">
        <UInput
          v-model="form.name"
          placeholder="e.g. Merdeka Day"
          class="w-full"
        />
      </UFormField>
      <UButton
        type="submit"
        label="Add holiday"
        icon="i-lucide-plus"
        :loading="busy && editingId === null"
        :disabled="!form.date || !form.name.trim()"
      />
    </form>

    <p
      v-if="!holidays?.length"
      class="text-sm text-muted"
    >
      No public holidays yet. Add them above - leave then skips them.
    </p>

    <div
      v-for="[year, list] in byYear"
      :key="year"
      class="mb-3"
    >
      <p class="mb-1 text-xs tracking-wide text-muted uppercase">
        {{ year }}
      </p>
      <div
        v-for="h in list"
        :key="h.id"
        class="border-b border-default py-2 last:border-b-0"
        :data-testid="`holiday-${h.id}`"
      >
        <form
          v-if="editingId === h.id"
          class="grid grid-cols-1 items-end gap-3 sm:grid-cols-[11rem_1fr_auto_auto]"
          @submit.prevent="saveEdit"
        >
          <UInput
            v-model="edit.date"
            type="date"
            class="w-full"
          />
          <UInput
            v-model="edit.name"
            class="w-full"
          />
          <UButton
            type="submit"
            size="sm"
            label="Save"
            :loading="busy"
            :disabled="!edit.date || !edit.name.trim()"
          />
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            label="Cancel"
            :disabled="busy"
            @click="editingId = null"
          />
        </form>
        <div
          v-else
          class="flex flex-wrap items-center justify-between gap-2"
        >
          <p>
            <span class="font-medium">{{ formatDateMY(h.date) }}</span>
            <span class="text-muted"> · {{ weekdayShort(h.date) }}</span>
            <span class="ml-2">{{ h.name }}</span>
            <UBadge
              v-if="!isWorkingDay(h.date)"
              class="ml-2"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              Weekend - no effect
            </UBadge>
          </p>
          <div class="flex gap-1">
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              label="Edit"
              @click="startEdit(h)"
            />
            <UButton
              size="xs"
              variant="ghost"
              color="error"
              label="Remove"
              @click="deleting = h"
            />
          </div>
        </div>
      </div>
    </div>
  </UCard>

  <UModal
    v-model:open="deleteOpen"
    :title="`Remove ${deleting?.name ?? 'holiday'}?`"
  >
    <template #body>
      <p class="text-sm">
        Leave applied for from now on will count this day as a working day again. Leave already applied for is not
        changed.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Keep it"
          color="neutral"
          variant="outline"
          :disabled="busy"
          @click="deleting = null"
        />
        <UButton
          label="Remove holiday"
          color="error"
          :loading="busy"
          @click="confirmDelete"
        />
      </div>
    </template>
  </UModal>
</template>
