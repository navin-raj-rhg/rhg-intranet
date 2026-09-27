<script setup lang="ts">
import { EXPENSE_CATEGORY_LABELS } from '~~/shared/utils/expenseCategories'

interface ExpenseClaim {
  id: number
  category: string
  amount: string
  description: string
  expenseDate: string
  status: 'submitted' | 'approved' | 'paid'
  employeeName: string | null
  employeeEmail: string | null
}

interface PayoutBatch {
  id: number
  runAt: string
  claimCount: number
  totalAmount: string
  pdfKey: string | null
  runByName: string | null
  runByEmail: string | null
}

const toast = useToast()

const { data: pending, refresh: refreshPending } = await useAsyncData('expense-claims-submitted', () =>
  useApiFetch<ExpenseClaim[]>('/api/tools/expense-claims/claims', { query: { status: 'submitted' } })
)
const { data: readyForPayout, refresh: refreshReady } = await useAsyncData('expense-claims-approved', () =>
  useApiFetch<ExpenseClaim[]>('/api/tools/expense-claims/claims', { query: { status: 'approved' } })
)
const { data: history, refresh: refreshHistory } = await useAsyncData('expense-claims-batches', () =>
  useApiFetch<PayoutBatch[]>('/api/tools/expense-claims/reports')
)

const approvingId = ref<number | null>(null)

async function approveClaim(id: number) {
  approvingId.value = id
  try {
    await useApiFetch(`/api/tools/expense-claims/claims/${id}/approve`, { method: 'POST' })
    toast.add({ title: 'Claim approved', color: 'success' })
    await Promise.all([refreshPending(), refreshReady()])
  } catch (err) {
    toast.add({
      title: 'Could not approve claim',
      description: err instanceof Error ? err.message : 'Something went wrong.',
      color: 'error'
    })
  } finally {
    approvingId.value = null
  }
}

async function viewReceipt(id: number) {
  try {
    const { receiptUrl } = await useApiFetch<{ receiptUrl: string }>(`/api/tools/expense-claims/claims/${id}`)
    window.open(receiptUrl, '_blank')
  } catch {
    toast.add({ title: 'Could not open receipt', color: 'error' })
  }
}

const runningReport = ref(false)

async function runReport() {
  runningReport.value = true
  try {
    const result = await useApiFetch<{ pdfUrl: string }>('/api/tools/expense-claims/reports', { method: 'POST' })
    toast.add({ title: 'Payroll report generated', color: 'success' })
    window.open(result.pdfUrl, '_blank')
    await Promise.all([refreshReady(), refreshHistory()])
  } catch (err) {
    toast.add({
      title: 'Could not run report',
      description: err instanceof Error ? err.message : 'Something went wrong.',
      color: 'error'
    })
  } finally {
    runningReport.value = false
  }
}

async function downloadBatchPdf(id: number) {
  try {
    const { pdfUrl } = await useApiFetch<{ pdfUrl: string }>(`/api/tools/expense-claims/reports/${id}`)
    window.open(pdfUrl, '_blank')
  } catch {
    toast.add({ title: 'Could not open report', color: 'error' })
  }
}
</script>

<template>
  <div class="mt-8 space-y-8">
    <UCard>
      <template #header>
        <span class="font-medium">Pending approval</span>
      </template>

      <p
        v-if="!pending?.length"
        class="text-sm text-muted"
      >
        Nothing waiting on you right now.
      </p>

      <div
        v-for="claim in pending"
        :key="claim.id"
        class="flex items-start justify-between gap-4 border-b border-default py-4 last:border-b-0"
      >
        <div>
          <p class="font-medium">
            {{ claim.employeeName || claim.employeeEmail }} — {{ EXPENSE_CATEGORY_LABELS[claim.category] ?? claim.category }}
          </p>
          <p class="text-sm text-muted">
            {{ claim.expenseDate }} — {{ claim.description }}
          </p>
        </div>
        <div class="text-right shrink-0">
          <p class="font-semibold">
            RM {{ claim.amount }}
          </p>
          <div class="flex gap-2 mt-1 justify-end">
            <UButton
              size="xs"
              variant="ghost"
              @click="viewReceipt(claim.id)"
            >
              Receipt
            </UButton>
            <UButton
              size="xs"
              :loading="approvingId === claim.id"
              @click="approveClaim(claim.id)"
            >
              Approve
            </UButton>
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">Approved — ready for payout</span>
          <UButton
            size="sm"
            :disabled="!readyForPayout?.length"
            :loading="runningReport"
            @click="runReport"
          >
            Run payroll report
          </UButton>
        </div>
      </template>

      <p
        v-if="!readyForPayout?.length"
        class="text-sm text-muted"
      >
        No approved claims waiting to be paid.
      </p>

      <div
        v-for="claim in readyForPayout"
        :key="claim.id"
        class="flex items-center justify-between gap-4 border-b border-default py-3 last:border-b-0"
      >
        <div>
          <p class="font-medium">
            {{ claim.employeeName || claim.employeeEmail }} — {{ EXPENSE_CATEGORY_LABELS[claim.category] ?? claim.category }}
          </p>
          <p class="text-sm text-muted">
            {{ claim.expenseDate }} — {{ claim.description }}
          </p>
        </div>
        <p class="font-semibold shrink-0">
          RM {{ claim.amount }}
        </p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <span class="font-medium">Report history</span>
      </template>

      <p
        v-if="!history?.length"
        class="text-sm text-muted"
      >
        No payroll reports have been run yet.
      </p>

      <div
        v-for="batch in history"
        :key="batch.id"
        class="flex items-center justify-between gap-4 border-b border-default py-3 last:border-b-0"
      >
        <div>
          <p class="font-medium">
            {{ new Date(batch.runAt).toLocaleString() }}
          </p>
          <p class="text-sm text-muted">
            {{ batch.claimCount }} claim(s) — run by {{ batch.runByName || batch.runByEmail }}
          </p>
        </div>
        <div class="text-right shrink-0">
          <p class="font-semibold">
            RM {{ batch.totalAmount }}
          </p>
          <UButton
            size="xs"
            variant="ghost"
            @click="downloadBatchPdf(batch.id)"
          >
            Download PDF
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>
