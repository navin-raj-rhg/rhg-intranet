<script setup lang="ts">
const route = useRoute()
const reportId = Number(route.params.id)
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/tools/inspection-reporting"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="Back to Inspection Reporting"
      class="-ml-2 mb-4"
    />

    <UAlert
      v-if="!Number.isInteger(reportId) || reportId <= 0"
      color="error"
      variant="subtle"
      title="That inspection report doesn't exist"
    />
    <InspectionReportingReportEditor
      v-else
      :report-id="reportId"
    />
  </UContainer>
</template>
