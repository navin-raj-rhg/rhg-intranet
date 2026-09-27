<script setup lang="ts">
interface MyRoleResponse {
  role: 'owner' | 'employee' | 'manager'
}

const { data: roleData, pending, error } = await useAsyncData('expense-claims-my-role', () =>
  useApiFetch<MyRoleResponse>('/api/tools/expense-claims/my-role')
)

// The owner bypass can land on either view - owner gets the manager view
// since it has the full picture (approval queue + payroll report), and the
// owner bypass already lets them submit claims too if they ever need to via
// the API, even though that's not exposed in this view.
const showManagerView = computed(() => roleData.value?.role === 'manager' || roleData.value?.role === 'owner')
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Expense Claims"
      description="Submit expense claims and, for managers, approve them and run payroll reports."
    />

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
      <ExpenseClaimsManagerView v-if="showManagerView" />
      <ExpenseClaimsEmployeeView v-else />
    </template>
  </UContainer>
</template>
