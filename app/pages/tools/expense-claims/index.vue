<script setup lang="ts">
const authStore = useAuthStore()

interface MyRoleResponse {
  roles: string[]
  // True for an employee who isn't linked to any manager yet.
  missingManager: boolean
}

const { data: roleData, pending, error } = await useAsyncData('expense-claims-my-role', () =>
  useApiFetch<MyRoleResponse>('/api/tools/expense-claims/my-role')
)

const roles = computed(() => roleData.value?.roles ?? [])

// The owner sees the manager view (approval queue + payroll report for
// everyone). A user holding both 'employee' and 'manager' gets both views,
// switchable with tabs; a single-role user just gets their one view.
const isEmployee = computed(() => roles.value.includes('employee'))
const isManager = computed(() => roles.value.includes('manager') || roles.value.includes('owner'))

const tab = ref<'employee' | 'manager'>(isManager.value ? 'manager' : 'employee')
const tabItems = [
  { label: 'Approvals & payroll', value: 'manager' },
  { label: 'My claims', value: 'employee' }
]

const showManagerView = computed(() => isManager.value && (!isEmployee.value || tab.value === 'manager'))
const showEmployeeView = computed(() => isEmployee.value && (!isManager.value || tab.value === 'employee'))
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
      title="Expense Claims"
      description="Submit expense claims and, for managers, approve them and run payroll reports."
    >
      <template
        v-if="authStore.profile?.isOwner"
        #links
      >
        <UButton
          to="/tools/expense-claims/access"
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
      description="You may not have access to Expense Claims yet - ask the workspace owner to assign you a role."
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
        description="You can't submit claims until the workspace owner links you to a manager."
      />

      <UTabs
        v-if="isEmployee && isManager"
        v-model="tab"
        class="mt-6"
        :items="tabItems"
        :content="false"
      />

      <ExpenseClaimsManagerView v-if="showManagerView" />
      <ExpenseClaimsEmployeeView v-if="showEmployeeView" />
    </template>
  </UContainer>
</template>
