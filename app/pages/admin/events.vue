<script setup lang="ts">
import { EVENT_NOTE_MAX, EVENT_PLACE_MAX, EVENT_TITLE_MAX, eventProblem } from '~~/shared/utils/eventRules'

/**
 * Owner-only Manage events (Step 18.6): add, change and remove the company
 * events shown in the dashboard's Upcoming events. Public holidays come from
 * Leave Applications and are not edited here.
 */
interface EventRow {
  id: number
  title: string
  date: string
  endDate: string | null
  time: string | null
  place: string | null
  note: string | null
}

const authStore = useAuthStore()
const toast = useToast()

const rows = ref<EventRow[]>([])
const loading = ref(true)
const loadError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    rows.value = await useApiFetch<EventRow[]>('/api/dashboard/events/all')
  } catch (err) {
    loadError.value = errorText(err)
  } finally {
    loading.value = false
  }
}

if (authStore.profile?.isOwner) await load()

const today = todayMY()
const upcoming = computed(() => rows.value.filter(r => (r.endDate ?? r.date) >= today))
const past = computed(() => rows.value.filter(r => (r.endDate ?? r.date) < today).reverse())

/* ---- add / change ---- */

const formOpen = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const form = reactive({ title: '', date: '', endDate: '', time: '', place: '', note: '' })

function openAdd() {
  editingId.value = null
  Object.assign(form, { title: '', date: '', endDate: '', time: '', place: '', note: '' })
  formOpen.value = true
}

function openEdit(r: EventRow) {
  editingId.value = r.id
  Object.assign(form, {
    title: r.title,
    date: r.date,
    endDate: r.endDate ?? '',
    time: r.time ?? '',
    place: r.place ?? '',
    note: r.note ?? ''
  })
  formOpen.value = true
}

const payload = () => ({
  title: form.title,
  date: form.date,
  endDate: form.endDate || null,
  time: form.time || null,
  place: form.place || null,
  note: form.note || null
})

async function save() {
  const problem = eventProblem(payload())
  if (problem) return void toast.add({ title: problem, color: 'error' })
  saving.value = true
  try {
    if (editingId.value === null) {
      await useApiFetch('/api/dashboard/events', { method: 'POST', body: payload() })
    } else {
      await useApiFetch(`/api/dashboard/events/${editingId.value}`, { method: 'PUT', body: payload() })
    }
    formOpen.value = false
    await load()
    toast.add({ title: 'Event saved', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Couldn\'t save the event', description: errorText(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

/* ---- remove ---- */

const removing = ref<EventRow | null>(null)
const removeOpen = ref(false)
const removeWorking = ref(false)

function askRemove(r: EventRow) {
  removing.value = r
  removeOpen.value = true
}

async function doRemove() {
  if (!removing.value) return
  removeWorking.value = true
  try {
    await useApiFetch(`/api/dashboard/events/${removing.value.id}`, { method: 'DELETE' })
    removeOpen.value = false
    await load()
  } catch (err) {
    toast.add({ title: 'Couldn\'t remove the event', description: errorText(err), color: 'error' })
  } finally {
    removeWorking.value = false
  }
}
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="Back to the dashboard"
      class="-ml-2 mb-2"
    />

    <UPageHeader
      title="Manage events"
      description="Company events shown in Upcoming events on the dashboard. Public holidays appear there automatically."
    />

    <UAlert
      v-if="!authStore.profile?.isOwner"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Owner access required"
      description="Only the workspace owner can manage events."
    />

    <template v-else>
      <div class="mt-6">
        <UButton
          icon="i-lucide-plus"
          label="Add an event"
          data-testid="add-event"
          @click="openAdd"
        />
      </div>

      <UAlert
        v-if="loadError"
        class="mt-6"
        color="error"
        variant="subtle"
        title="Couldn't load events"
        :description="loadError"
      />
      <p
        v-else-if="loading"
        class="mt-6 text-sm text-muted"
      >
        Loading…
      </p>

      <template v-else>
        <UCard class="mt-6">
          <template #header>
            <span class="font-medium">Upcoming ({{ upcoming.length }})</span>
          </template>
          <p
            v-if="!upcoming.length"
            class="text-sm text-muted"
          >
            No upcoming events. Add one above.
          </p>
          <ul
            v-else
            class="divide-y divide-default"
            data-testid="upcoming-list"
          >
            <li
              v-for="r in upcoming"
              :key="r.id"
              class="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
            >
              <div class="min-w-0 text-sm">
                <p class="text-xs text-muted">
                  {{ formatDateRangeMY(r.date, r.endDate ?? r.date) }}<template v-if="r.time">
                    · {{ r.time }}
                  </template>
                </p>
                <p class="font-medium">
                  {{ r.title }}
                </p>
                <p
                  v-if="r.place"
                  class="text-xs text-muted"
                >
                  {{ r.place }}
                </p>
                <p
                  v-if="r.note"
                  class="whitespace-pre-wrap text-xs text-muted"
                >
                  {{ r.note }}
                </p>
              </div>
              <div class="flex gap-1">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-pencil"
                  :aria-label="`Edit ${r.title}`"
                  @click="openEdit(r)"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  icon="i-lucide-trash-2"
                  :aria-label="`Remove ${r.title}`"
                  @click="askRemove(r)"
                />
              </div>
            </li>
          </ul>
        </UCard>

        <UCard
          v-if="past.length"
          class="mt-6"
        >
          <template #header>
            <span class="font-medium">Past ({{ past.length }})</span>
          </template>
          <ul class="divide-y divide-default">
            <li
              v-for="r in past"
              :key="r.id"
              class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0"
            >
              <span class="min-w-0">
                <span class="text-muted">{{ formatDateRangeMY(r.date, r.endDate ?? r.date) }}</span>
                · {{ r.title }}
              </span>
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                :aria-label="`Remove ${r.title}`"
                @click="askRemove(r)"
              />
            </li>
          </ul>
        </UCard>
      </template>
    </template>

    <UModal
      v-model:open="formOpen"
      :title="editingId === null ? 'Add an event' : 'Edit event'"
    >
      <template #body>
        <form
          class="space-y-4"
          @submit.prevent="save"
        >
          <UFormField
            label="Title"
            required
          >
            <UInput
              v-model="form.title"
              class="w-full"
              :maxlength="EVENT_TITLE_MAX"
              placeholder="e.g. Staff lunch"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Date"
              required
            >
              <UInput
                v-model="form.date"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="End date"
              hint="optional"
            >
              <UInput
                v-model="form.endDate"
                type="date"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Time"
              hint="optional"
            >
              <UInput
                v-model="form.time"
                type="time"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Place"
              hint="optional"
            >
              <UInput
                v-model="form.place"
                class="w-full"
                :maxlength="EVENT_PLACE_MAX"
              />
            </UFormField>
          </div>
          <UFormField
            label="Note"
            hint="optional"
          >
            <UTextarea
              v-model="form.note"
              class="w-full"
              autoresize
              :rows="2"
              :maxlength="EVENT_NOTE_MAX"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              variant="outline"
              color="neutral"
              label="Cancel"
              @click="formOpen = false"
            />
            <UButton
              type="submit"
              label="Save"
              :loading="saving"
            />
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="removeOpen"
      title="Remove this event?"
      :description="removing ? `${removing.title} (${formatDateMY(removing.date)}) will be removed.` : undefined"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="outline"
            color="neutral"
            label="Cancel"
            @click="removeOpen = false"
          />
          <UButton
            color="error"
            label="Remove"
            :loading="removeWorking"
            @click="doRemove"
          />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
