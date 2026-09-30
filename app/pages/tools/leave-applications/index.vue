<script setup lang="ts">
const authStore = useAuthStore()

interface MyRoleResponse {
  roles: string[]
  // True for someone who applies for leave (employee, or the owner) but isn't
  // linked to any manager yet, so nobody could approve their leave.
  missingManager: boolean
}

const { data: roleData, pending, error } = await useAsyncData('leave-applications-my-role', () =>
  useApiFetch<MyRoleResponse>('/api/tools/leave-applications/my-role')
)

const roles = computed(() => roleData.value?.roles ?? [])

// The owner can apply too (they need a linked manager like everyone else) and
// sees every team's approvals. Someone who is both an employee and a manager
// gets both views, switchable with tabs, like Expense Claims.
const canApplyForLeave = computed(() => roles.value.includes('employee') || roles.value.includes('owner'))
const isManager = computed(() => roles.value.includes('manager') || roles.value.includes('owner'))

type TabValue = 'manager' | 'employee' | 'calendar'

// Everyone sees the team calendar. Managers get the approvals tab, people who
// can apply get "My leave". The first tab is whichever matters most to them.
const tabItems = computed(() => {
  const items: { label: string, value: TabValue }[] = []
  if (isManager.value) items.push({ label: 'Team approvals', value: 'manager' })
  if (canApplyForLeave.value) items.push({ label: 'My leave', value: 'employee' })
  items.push({ label: 'Team calendar', value: 'calendar' })
  return items
})

const tab = ref<TabValue>(tabItems.value[0]!.value)
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Leave Applications"
      description="Apply for leave, check your balances and see who is away. Managers approve their team's leave here."
    >
      <template
        v-if="authStore.profile?.isOwner"
        #links
      >
        <UButton
          to="/tools/leave-applications/access"
          icon="i-lucide-users"
          variant="outline"
          label="Manage access"
        />
      </template>
    </UPageHeader>

    <UAlert
      v-if="error"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Couldn't load this tool"
      description="You may not have access to Leave Applications yet - ask the workspace owner to assign you a role."
    />

    <div
      v-else-if="pending"
      class="mt-6 text-sm text-muted"
    >
      Loading…
    </div>

    <template v-else>
      <UAlert
        v-if="roleData?.missingManager"
        class="mt-6"
        color="warning"
        variant="subtle"
        title="No approving manager assigned"
        description="You can't apply for leave until you are linked to a manager. The workspace owner can do this in Manage access."
      />

      <UTabs
        v-model="tab"
        class="mt-6"
        :items="tabItems"
        :content="false"
      />

      <LeaveApplicationsManagerView v-if="tab === 'manager'" />
      <LeaveApplicationsEmployeeView
        v-if="tab === 'employee'"
        :can-apply="!roleData?.missingManager"
      />
      <LeaveApplicationsTeamCalendar v-if="tab === 'calendar'" />
    </template>
  </UContainer>
</template>
