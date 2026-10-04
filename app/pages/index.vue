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
// The "Project overview" tile needs access to Projects, the same rule as its API.
const canSeeProjects = (tools ?? []).some(t => t.id === 'projects')

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

// Favourite tools (stars on the launcher, shown in the Favourite tools tile).
const favourites = useFavouriteTools()
await useAsyncData('dashboard-favourites', async () => {
  await favourites.load()
  return true
})

// The top row spreads evenly over however many tiles this person can see.
const topRowColumns = computed(() => {
  const count = 1 + (canSeeProjects ? 1 : 0) + (canSeeLeave ? 1 : 0)
  return ({ 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3' } as Record<number, string>)[count]
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

    <!-- Top row: the personal tiles - Favourite tools, My tasks (needs Projects) and Away today
         (needs Leave). They share the width evenly; on a phone they stack. -->
    <div
      class="mt-8 grid gap-4"
      :class="topRowColumns"
    >
      <div class="h-64">
        <DashboardFavouriteTools :tools="tools ?? []" />
      </div>
      <div
        v-if="canSeeProjects"
        class="h-64"
      >
        <DashboardMyTasks />
      </div>
      <div
        v-if="canSeeLeave"
        class="h-64"
      >
        <DashboardAwayToday />
      </div>
    </div>

    <!-- Middle row: Posts (2/3) beside Upcoming events (1/3), the same height. -->
    <div class="mt-4 grid gap-4 lg:grid-cols-3">
      <div class="h-[32rem] lg:col-span-2 lg:h-[36rem]">
        <DashboardPostsWidget />
      </div>
      <div class="h-80 lg:h-[36rem]">
        <DashboardUpcomingEvents />
      </div>
    </div>

    <!-- Bottom row: Sales, Project and Goals overviews (Step 19). Project overview needs Projects access. -->
    <div class="mt-4 grid items-start gap-4 lg:grid-cols-3">
      <DashboardSalesOverview />
      <DashboardProjectOverview v-if="canSeeProjects" />
      <DashboardGoalsOverview />
    </div>

    <!-- Launcher: tools the current user can access -->
    <div class="mt-10">
      <h2 class="text-lg font-semibold mb-4">
        Tools
      </h2>

      <UPageGrid v-if="tools && tools.length > 0">
        <div
          v-for="tool in tools"
          :key="tool.id"
          class="relative"
        >
          <UButton
            :to="tool.route"
            variant="outline"
            color="neutral"
            class="h-auto w-full p-4 pr-12 justify-start"
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
          <UButton
            class="absolute right-2 top-2"
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-star"
            :class="favourites.isFavourite(tool.id) ? 'text-warning' : 'text-muted'"
            :ui="{ leadingIcon: favourites.isFavourite(tool.id) ? 'fill-current' : '' }"
            :aria-label="favourites.isFavourite(tool.id) ? `Remove ${tool.name} from favourites` : `Add ${tool.name} to favourites`"
            :data-testid="`star-${tool.id}`"
            @click="favourites.toggle(tool.id)"
          />
        </div>
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
      <UButton
        to="/admin/events"
        variant="outline"
        color="neutral"
        icon="i-lucide-calendar-days"
        label="Manage events"
        class="ml-2"
      />
      <UButton
        to="/admin/dashboard-data"
        variant="outline"
        color="neutral"
        icon="i-lucide-chart-column"
        label="Manage chart data"
        class="ml-2"
      />
    </div>
  </UContainer>
</template>
