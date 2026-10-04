<script setup lang="ts">
/**
 * Owner-only Manage chart data (Step 19.5): upload the CSV files behind the
 * dashboard's Sales overview and Goals overview. Each upload replaces that
 * chart's data. Project overview needs no upload (it reads the Projects tool).
 */
interface UploadInfo {
  fileName: string
  rowCount: number
  uploadedAt: string
  uploadedBy: string | null
}

const authStore = useAuthStore()

const uploads = ref<{ sales: UploadInfo | null, goals: UploadInfo | null }>({ sales: null, goals: null })
const loading = ref(true)
const loadError = ref('')

async function load() {
  loadError.value = ''
  try {
    uploads.value = await useApiFetch('/api/admin/dashboard-data')
  } catch (err) {
    loadError.value = errorText(err)
  } finally {
    loading.value = false
  }
}

if (authStore.profile?.isOwner) await load()
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
      title="Manage chart data"
      description="Upload the files behind the dashboard's Sales overview and Goals overview. Each upload replaces that chart's data."
    />

    <UAlert
      v-if="!authStore.profile?.isOwner"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Owner access required"
      description="Only the workspace owner can upload chart data."
    />

    <template v-else>
      <UAlert
        v-if="loadError"
        class="mt-6"
        color="error"
        variant="subtle"
        title="Couldn't load the upload details"
        :description="loadError"
      />
      <p
        v-else-if="loading"
        class="mt-6 text-sm text-muted"
      >
        Loading…
      </p>
      <div
        v-else
        class="mt-6 grid gap-6 lg:grid-cols-2"
      >
        <DashboardChartDataUpload
          kind="sales"
          title="Sales data"
          description="One row per sale or invoice line. Save your spreadsheet as CSV. Dates can be 2026-03-05 or 05/03/2026."
          columns="Date, Amount (required); Customer, Category, State, Quantity (optional)"
          :info="uploads.sales"
          @uploaded="load"
        />
        <DashboardChartDataUpload
          kind="goals"
          title="Goals data"
          description="One row per goal per month, with the target and what was actually achieved."
          columns="Goal, Month (like 2026-03), Target, Actual (required); Unit (optional)"
          :info="uploads.goals"
          @uploaded="load"
        />
      </div>
    </template>
  </UContainer>
</template>
