<script setup lang="ts">
const authStore = useAuthStore()
const toast = useToast()

const { data: ownerStatus, refresh: refreshOwnerStatus } = await useFetch('/api/auth/owner-status')
const tools = await useTools()
const claimingOwner = ref(false)
const openingToolId = ref<string | null>(null)

// Owner-only: people who signed up but have no role in any tool yet.
interface PendingUser {
  id: string
  email: string
  fullName: string | null
  createdAt: string
}

const isOwner = computed(() => !!authStore.profile?.isOwner)

// The "Away today" tile needs access to Leave Applications (the launcher list
// only contains tools this user can open).
const canSeeLeave = (tools ?? []).some(t => t.id === 'leave-applications')

const { data: pendingUsers, refresh: refreshPending } = await useAsyncData('pending-users', () =>
  isOwner.value
    ? useApiFetch<PendingUser[]>('/api/admin/pending-users').catch(() => [] as PendingUser[])
    : Promise.resolve([] as PendingUser[])
)

// Covers claiming owner on this very page: once you become owner, load the list.
watch(isOwner, (value) => {
  if (value) refreshPending()
})

const pendingSummary = computed(() => {
  const names = (pendingUsers.value ?? []).map(u => u.fullName || u.email)
  const shown = names.slice(0, 3).join(', ')
  return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown
})

// Managers (and the owner): expense claims and leave waiting for approval.
const { data: approvals } = await useAsyncData('pending-approvals', () =>
  useApiFetch<{ expenseClaims: number, leave: number }>('/api/dashboard/pending-approvals')
    .catch(() => ({ expenseClaims: 0, leave: 0 }))
)

const approvalItems = computed(() => {
  const items: { id: string, route: string, text: string }[] = []
  const claims = approvals.value?.expenseClaims ?? 0
  const leave = approvals.value?.leave ?? 0
  const expenseTool = (tools ?? []).find(t => t.id === 'expense-claims')
  const leaveTool = (tools ?? []).find(t => t.id === 'leave-applications')
  if (claims && expenseTool) {
    items.push({ id: expenseTool.id, route: expenseTool.route, text: `${claims} expense ${claims === 1 ? 'claim' : 'claims'}` })
  }
  if (leave && leaveTool) {
    items.push({ id: leaveTool.id, route: leaveTool.route, text: `${leave} leave ${leave === 1 ? 'application' : 'applications'}` })
  }
  return items
})

// Projects: tasks assigned to this person that are ready to work on.
const projectsTool = (tools ?? []).find(t => t.id === 'projects')
interface MyProjectTask { id: number, title: string, overdue: boolean }
const { data: myTasks } = await useAsyncData('dashboard-my-project-tasks', () =>
  projectsTool
    ? useApiFetch<MyProjectTask[]>('/api/tools/projects/my-tasks').catch(() => [] as MyProjectTask[])
    : Promise.resolve([] as MyProjectTask[])
)
const myTasksOverdue = computed(() => (myTasks.value ?? []).filter(t => t.overdue).length)
const myTasksText = computed(() => {
  const n = myTasks.value?.length ?? 0
  const base = `${n} ${n === 1 ? 'task is' : 'tasks are'} assigned to you and ready to start.`
  return myTasksOverdue.value ? `${base} ${myTasksOverdue.value} ${myTasksOverdue.value === 1 ? 'is' : 'are'} overdue.` : base
})

async function claimOwner() {
  claimingOwner.value = true
  try {
    await useApiFetch('/api/auth/claim-owner', { method: 'POST' })
    await authStore.fetchProfile()
    await refreshOwnerStatus()
    toast.add({ title: 'You are now the workspace owner', color: 'success' })
  } catch (err) {
    toast.add({
      title: 'Could not claim owner access',
      description: err instanceof Error ? err.message : 'Something went wrong.',
      color: 'error'
    })
  } finally {
    claimingOwner.value = false
  }
}
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Dashboard"
      description="Welcome to the RHG Intranet."
    />

    <UAlert
      v-if="!ownerStatus?.ownerExists"
      class="mt-6"
      color="warning"
      variant="subtle"
      title="No workspace owner is set yet"
      description="The owner has full access across every tool. Claim it now if this is your account."
    >
      <template #actions>
        <UButton
          size="sm"
          :loading="claimingOwner"
          @click="claimOwner"
        >
          Claim owner access
        </UButton>
      </template>
    </UAlert>

    <UAlert
      v-if="pendingUsers?.length"
      class="mt-6"
      color="warning"
      variant="subtle"
      icon="i-lucide-user-plus"
      :title="pendingUsers.length === 1 ? '1 new sign-up is waiting for access' : `${pendingUsers.length} new sign-ups are waiting for access`"
      :description="`${pendingSummary} can log in but can't see any tools until you assign a role.`"
    >
      <template #actions>
        <UButton
          v-for="tool in tools ?? []"
          :key="tool.id"
          size="sm"
          :to="`${tool.route}/access`"
        >
          Assign access in {{ tool.name }}
        </UButton>
      </template>
    </UAlert>

    <UAlert
      v-if="approvalItems.length"
      class="mt-6"
      color="warning"
      variant="subtle"
      icon="i-lucide-clipboard-check"
      title="Waiting for your approval"
      :description="approvalItems.map(i => i.text).join(' and ')"
    >
      <template #actions>
        <UButton
          v-for="item in approvalItems"
          :key="item.id"
          size="sm"
          :to="item.route"
        >
          Review {{ item.id === 'leave-applications' ? 'leave' : 'expense claims' }}
        </UButton>
      </template>
    </UAlert>

    <UAlert
      v-if="projectsTool && myTasks?.length"
      class="mt-6"
      :color="myTasksOverdue ? 'error' : 'warning'"
      variant="subtle"
      icon="i-lucide-list-checks"
      title="Tasks waiting for you"
      :description="myTasksText"
      data-testid="my-tasks-banner"
    >
      <template #actions>
        <UButton
          size="sm"
          :to="`${projectsTool.route}?tab=mine`"
        >
          See my tasks
        </UButton>
      </template>
    </UAlert>

    <!-- Widgets: at-a-glance info, placeholder data until real sources exist -->
    <UPageGrid class="mt-8">
      <UCard>
        <template #header>
          <span class="font-medium">Announcements</span>
        </template>
        <p class="text-sm text-muted">
          Placeholder: company announcements will appear here.
        </p>
      </UCard>

      <DashboardAwayToday v-if="canSeeLeave" />

      <UCard>
        <template #header>
          <span class="font-medium">Sales overview</span>
        </template>
        <p class="text-sm text-muted">
          Placeholder: sales snapshot / chart will appear here.
        </p>
      </UCard>

      <UCard>
        <template #header>
          <span class="font-medium">Upcoming events</span>
        </template>
        <p class="text-sm text-muted">
          Placeholder: upcoming events will appear here.
        </p>
      </UCard>
    </UPageGrid>

    <!-- Launcher: tools the current user can access -->
    <div class="mt-10">
      <h2 class="text-lg font-semibold mb-4">
        Tools
      </h2>

      <UPageGrid v-if="tools && tools.length > 0">
        <UButton
          v-for="tool in tools"
          :key="tool.id"
          :to="tool.route"
          variant="outline"
          color="neutral"
          class="h-auto p-4 justify-start"
          @click="openingToolId = tool.id"
        >
          <div class="flex items-center gap-3">
            <UIcon
              :name="openingToolId === tool.id ? 'i-lucide-loader-circle' : (tool.icon || 'i-lucide-puzzle')"
              class="size-6 shrink-0"
              :class="{ 'animate-spin': openingToolId === tool.id }"
            />
            <div class="text-left">
              <p class="font-medium">
                {{ tool.name }}
              </p>
              <p
                v-if="tool.description"
                class="text-xs text-muted"
              >
                {{ tool.description }}
              </p>
            </div>
          </div>
        </UButton>
      </UPageGrid>

      <UCard v-else>
        <p class="text-sm text-muted">
          No tools assigned to you yet. Ask the workspace owner to grant you access.
        </p>
      </UCard>
    </div>

    <!-- Owner housekeeping -->
    <div
      v-if="isOwner"
      class="mt-10"
    >
      <h2 class="text-lg font-semibold mb-4">
        Owner
      </h2>
      <UButton
        to="/admin/storage"
        variant="outline"
        color="neutral"
        icon="i-lucide-hard-drive"
        label="Storage clean-up"
      />
    </div>
  </UContainer>
</template>
