<script setup lang="ts">
/**
 * Owner-only card: each person's join date and date of birth. They drive the
 * years-of-service leave tiers and Birthday / Anniversary leave, so until they
 * are set, tiers fall back to the lowest and those two leave types are blocked.
 *
 * Dates are typed day-first (dd/mm/yyyy) and parsed here, not picked from the
 * browser's date input, so what people see never depends on browser language.
 * The server re-checks everything (past birth date, join after birth, ...).
 */
interface DateUser {
  id: string
  email: string
  fullName: string | null
  isOwner: boolean
  joinDate: string | null
  dateOfBirth: string | null
}

interface Draft {
  join: string
  dob: string
}

const toast = useToast()

// Same list the access card uses; its own key so refreshing one never disturbs the other.
const { data: users, refresh } = await useAsyncData('leave-profile-dates', () =>
  useApiFetch<DateUser[]>('/api/admin/tools/leave-applications/users')
)

const asText = (iso: string | null) => (iso ? formatDateMY(iso) : '')
const drafts = ref<Record<string, Draft>>({})

function draftFrom(user: DateUser): Draft {
  return { join: asText(user.joinDate), dob: asText(user.dateOfBirth) }
}

watch(users, (list) => {
  for (const user of list ?? []) {
    if (!drafts.value[user.id]) drafts.value[user.id] = draftFrom(user)
  }
}, { immediate: true })

const displayName = (user: DateUser) => user.fullName || user.email

type Parsed = { ok: true, value: string | null } | { ok: false }

// Empty = "not set" (null). Anything typed must be a real dd/mm/yyyy date.
function parse(text: string): Parsed {
  if (!text.trim()) return { ok: true, value: null }
  const iso = parseDateMY(text)
  return iso ? { ok: true, value: iso } : { ok: false }
}

function state(user: DateUser) {
  const draft = drafts.value[user.id]
  const join = parse(draft?.join ?? '')
  const dob = parse(draft?.dob ?? '')
  const valid = join.ok && dob.ok
  const dirty = !!draft && valid
    && (join.value !== user.joinDate || dob.value !== user.dateOfBirth)
  return { join, dob, valid, dirty }
}

function errorText(err: unknown) {
  const e = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
  return e?.data?.statusMessage || e?.statusMessage || e?.message || 'Something went wrong.'
}

const savingId = ref<string | null>(null)

async function save(user: DateUser) {
  const s = state(user)
  if (!s.join.ok || !s.dob.ok) return

  savingId.value = user.id
  try {
    await useApiFetch(`/api/admin/profiles/${user.id}/dates`, {
      method: 'PUT',
      body: { joinDate: s.join.value, dateOfBirth: s.dob.value }
    })
    toast.add({ title: `Dates updated for ${displayName(user)}`, color: 'success' })
    await refresh()
    const fresh = users.value?.find(u => u.id === user.id)
    if (fresh) drafts.value[user.id] = draftFrom(fresh)
  } catch (err) {
    toast.add({ title: 'Could not save dates', description: errorText(err), color: 'error' })
  } finally {
    savingId.value = null
  }
}

const missingCount = computed(() =>
  (users.value ?? []).filter(u => !u.joinDate || !u.dateOfBirth).length
)
</script>

<template>
  <UCard class="mt-8">
    <template #header>
      <div>
        <p class="font-medium">
          Join dates and dates of birth
        </p>
        <p class="text-sm text-muted">
          Type dates as dd/mm/yyyy. The join date sets each person's leave entitlement by years of service
          and their Anniversary leave month; the date of birth sets their Birthday leave month.
          Leave a box empty to mark it as not set.
        </p>
        <p
          v-if="missingCount"
          class="mt-1 text-sm text-warning"
        >
          {{ missingCount }} {{ missingCount === 1 ? 'person is' : 'people are' }} missing one or both dates.
        </p>
      </div>
    </template>

    <p
      v-if="!users?.length"
      class="text-sm text-muted"
    >
      No users have signed up yet.
    </p>

    <div
      v-for="user in users"
      :key="user.id"
      class="flex flex-wrap items-start justify-between gap-4 border-b border-default py-4 last:border-b-0"
    >
      <div class="min-w-56">
        <p class="font-medium">
          {{ displayName(user) }}
          <UBadge
            v-if="user.isOwner"
            class="ml-1"
            color="primary"
            variant="subtle"
            size="sm"
          >
            Owner
          </UBadge>
        </p>
        <p
          v-if="user.fullName"
          class="text-sm text-muted"
        >
          {{ user.email }}
        </p>
      </div>

      <div
        v-if="drafts[user.id]"
        class="flex flex-1 flex-wrap items-start justify-end gap-x-6 gap-y-3"
      >
        <UFormField
          label="Join date"
          :error="state(user).join.ok ? undefined : 'Use dd/mm/yyyy, e.g. 15/03/2020'"
        >
          <UInput
            v-model="drafts[user.id]!.join"
            placeholder="dd/mm/yyyy"
            class="w-40"
          />
        </UFormField>

        <UFormField
          label="Date of birth"
          :error="state(user).dob.ok ? undefined : 'Use dd/mm/yyyy, e.g. 01/08/1990'"
        >
          <UInput
            v-model="drafts[user.id]!.dob"
            placeholder="dd/mm/yyyy"
            class="w-40"
          />
        </UFormField>

        <UButton
          size="sm"
          class="mt-6"
          :disabled="!state(user).dirty"
          :loading="savingId === user.id"
          @click="save(user)"
        >
          Save
        </UButton>
      </div>
    </div>
  </UCard>
</template>
