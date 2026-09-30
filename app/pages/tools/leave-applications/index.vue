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

// The owner can apply too (they need a linked manager like everyone else).
const canApplyForLeave = computed(() => roles.value.includes('employee') || roles.value.includes('owner'))
const isManagerOnly = computed(() => roles.value.includes('manager') && !canApplyForLeave.value)
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Leave Applications"
      description="Apply for leave, check your balances and see the status of your requests."
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

      <UAlert
        v-if="isManagerOnly"
        class="mt-6"
        color="info"
        variant="subtle"
        title="Approvals are coming"
        description="The team approvals inbox and the team calendar are being added next."
      />

      <LeaveApplicationsEmployeeView
        v-if="canApplyForLeave"
        :can-apply="!roleData?.missingManager"
      />
    </template>
  </UContainer>
</template>
