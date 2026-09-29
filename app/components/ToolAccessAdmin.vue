<script setup lang="ts">
/**
 * Owner-only access manager for ONE tool: lists every signed-up user with a
 * checkbox per role the tool defines and, for tools that use employee ->
 * manager links, a picker for each employee's approving manager(s).
 * Reusable: `<ToolAccessAdmin tool-id="leave-applications" />`. Talks to the
 * generic /api/admin/tools/:toolId/* routes, which enforce every rule.
 */
const props = defineProps<{ toolId: string }>()

interface ToolConfig {
  toolId: string
  toolName: string
  usesManagerLinks: boolean
  roles: { roleKey: string, roleLabel: string }[]
}

interface AccessUser {
  id: string
  email: string
  fullName: string | null
  isOwner: boolean
  roles: string[]
  managerIds: string[]
}

interface Draft {
  roles: string[]
  managerIds: string[]
}

const toast = useToast()

const { data: config, error: configError } = await useAsyncData(`tool-access-config-${props.toolId}`, () =>
  useApiFetch<ToolConfig>(`/api/admin/tools/${props.toolId}/roles`)
)
const { data: users, refresh } = await useAsyncData(`tool-access-users-${props.toolId}`, () =>
  useApiFetch<AccessUser[]>(`/api/admin/tools/${props.toolId}/users`)
)

// What's currently ticked in each row, before saving. Kept per user so
// editing one row never disturbs unsaved edits in another.
const drafts = ref<Record<string, Draft>>({})

function draftFrom(user: AccessUser): Draft {
  return { roles: [...user.roles], managerIds: [...user.managerIds] }
}

watch(users, (list) => {
  for (const user of list ?? []) {
    if (!drafts.value[user.id]) drafts.value[user.id] = draftFrom(user)
  }
}, { immediate: true })

const displayName = (user: AccessUser) => user.fullName || user.email

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')

function isDirty(user: AccessUser) {
  const draft = drafts.value[user.id]
  return !!draft && !(sameSet(draft.roles, user.roles) && sameSet(draft.managerIds, user.managerIds))
}

function needsManager(user: AccessUser) {
  const draft = drafts.value[user.id]
  return !!config.value?.usesManagerLinks && !!draft?.roles.includes('employee') && draft.managerIds.length === 0
}

function toggleRole(user: AccessUser, roleKey: string, checked: boolean | 'indeterminate') {
  const draft = drafts.value[user.id]
  if (!draft) return
  draft.roles = checked === true
    ? [...new Set([...draft.roles, roleKey])]
    : draft.roles.filter(r => r !== roleKey)
  // Links only exist for employees, so un-ticking Employee clears them.
  if (roleKey === 'employee' && checked !== true) draft.managerIds = []
}

// Only people already SAVED as a manager can be picked (the server checks
// this too), and nobody can be their own manager.
function managerItems(forUser: AccessUser) {
  return (users.value ?? [])
    .filter(u => u.id !== forUser.id && u.roles.includes('manager'))
    .map(u => ({ label: displayName(u), value: u.id }))
}

function errorText(err: unknown) {
  const e = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
  return e?.data?.statusMessage || e?.statusMessage || e?.message || 'Something went wrong.'
}

const savingId = ref<string | null>(null)

async function save(user: AccessUser) {
  const draft = drafts.value[user.id]
  if (!draft) return

  savingId.value = user.id
  try {
    await useApiFetch(`/api/admin/tools/${props.toolId}/users/${user.id}`, {
      method: 'PUT',
      body: { roles: draft.roles, managerIds: draft.managerIds }
    })
    toast.add({ title: `Access updated for ${displayName(user)}`, color: 'success' })
    await refresh()
    const fresh = users.value?.find(u => u.id === user.id)
    if (fresh) drafts.value[user.id] = draftFrom(fresh)
  } catch (err) {
    toast.add({ title: 'Could not save access', description: errorText(err), color: 'error' })
  } finally {
    savingId.value = null
  }
}
</script>

<template>
  <UAlert
    v-if="configError"
    class="mt-6"
    color="error"
    variant="subtle"
    title="Couldn't load access settings"
    description="Only the workspace owner can manage access, and the tool must exist."
  />

  <UCard
    v-else-if="config"
    class="mt-8"
  >
    <template #header>
      <div>
        <p class="font-medium">
          Who can use {{ config.toolName }}
        </p>
        <p class="text-sm text-muted">
          New sign-ups have no access until you tick a role and save.
          <template v-if="config.usesManagerLinks">
            Employees need at least one manager, and a manager must be saved as a Manager before you can choose them.
          </template>
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
          <UBadge
            v-if="!user.roles.length"
            class="ml-1"
            color="warning"
            variant="subtle"
            size="sm"
          >
            No access
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
        <div class="flex items-center gap-4 pt-1">
          <UCheckbox
            v-for="role in config.roles"
            :key="role.roleKey"
            :label="role.roleLabel"
            :model-value="drafts[user.id]!.roles.includes(role.roleKey)"
            @update:model-value="toggleRole(user, role.roleKey, $event)"
          />
        </div>

        <div
          v-if="config.usesManagerLinks && drafts[user.id]!.roles.includes('employee')"
          class="w-64"
        >
          <USelectMenu
            v-if="managerItems(user).length"
            v-model="drafts[user.id]!.managerIds"
            :items="managerItems(user)"
            value-key="value"
            multiple
            placeholder="Choose manager(s)"
            class="w-full"
          />
          <p
            v-else
            class="pt-1 text-sm text-muted"
          >
            No managers yet - save someone as Manager first.
          </p>
          <p
            v-if="needsManager(user) && managerItems(user).length"
            class="mt-1 text-xs text-warning"
          >
            Choose at least one manager.
          </p>
        </div>

        <UButton
          size="sm"
          :disabled="!isDirty(user) || needsManager(user)"
          :loading="savingId === user.id"
          @click="save(user)"
        >
          Save
        </UButton>
      </div>
    </div>
  </UCard>
</template>
