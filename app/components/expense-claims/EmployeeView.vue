<script setup lang="ts">
import { EXPENSE_CATEGORY_OPTIONS, EXPENSE_CATEGORY_LABELS } from '~~/shared/utils/expenseCategories'

interface ExpenseClaim {
  id: number
  category: string
  amount: string
  description: string
  expenseDate: string
  receiptKey: string
  status: 'submitted' | 'approved' | 'paid'
  createdAt: string
}

const toast = useToast()
const { uploadFile } = useR2Storage()

const { data: claims, refresh } = await useAsyncData('my-expense-claims', () =>
  useApiFetch<ExpenseClaim[]>('/api/tools/expense-claims/claims')
)

const statusColor: Record<ExpenseClaim['status'], 'warning' | 'info' | 'success'> = {
  submitted: 'warning',
  approved: 'info',
  paid: 'success'
}

// --- New claim form ---
const form = reactive({
  category: '',
  amount: '',
  expenseDate: '',
  description: ''
})
const receiptFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const submitting = ref(false)

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  receiptFile.value = target.files?.[0] ?? null
}

function resetForm() {
  form.category = ''
  form.amount = ''
  form.expenseDate = ''
  form.description = ''
  receiptFile.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

async function submitClaim() {
  if (!receiptFile.value) {
    toast.add({ title: 'A receipt is required', color: 'error' })
    return
  }
  submitting.value = true
  try {
    const receiptKey = await uploadFile('expense-claims', receiptFile.value)
    await useApiFetch('/api/tools/expense-claims/claims', {
      method: 'POST',
      body: {
        category: form.category,
        amount: Number(form.amount),
        expenseDate: form.expenseDate,
        description: form.description,
        receiptKey
      }
    })
    toast.add({ title: 'Claim submitted', color: 'success' })
    resetForm()
    await refresh()
  } catch (err) {
    toast.add({
      title: 'Could not submit claim',
      description: err instanceof Error ? err.message : 'Something went wrong.',
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}

// --- Edit (inline) ---
const editingId = ref<number | null>(null)
const editForm = reactive({
  category: '',
  amount: '',
  expenseDate: '',
  description: ''
})
const editReceiptFile = ref<File | null>(null)
const editFileInputRef = ref<HTMLInputElement | null>(null)
const savingEdit = ref(false)

function startEdit(claim: ExpenseClaim) {
  editingId.value = claim.id
  editForm.category = claim.category
  editForm.amount = claim.amount
  editForm.expenseDate = claim.expenseDate
  editForm.description = claim.description
  editReceiptFile.value = null
  if (editFileInputRef.value) editFileInputRef.value.value = ''
}

function cancelEdit() {
  editingId.value = null
}

function onEditFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  editReceiptFile.value = target.files?.[0] ?? null
}

async function saveEdit(id: number) {
  savingEdit.value = true
  try {
    const receiptKey = editReceiptFile.value
      ? await uploadFile('expense-claims', editReceiptFile.value)
      : undefined

    await useApiFetch(`/api/tools/expense-claims/claims/${id}`, {
      method: 'PATCH',
      body: {
        category: editForm.category,
        amount: Number(editForm.amount),
        expenseDate: editForm.expenseDate,
        description: editForm.description,
        ...(receiptKey ? { receiptKey } : {})
      }
    })
    toast.add({ title: 'Claim updated', color: 'success' })
    editingId.value = null
    await refresh()
  } catch (err) {
    toast.add({
      title: 'Could not update claim',
      description: err instanceof Error ? err.message : 'Something went wrong.',
      color: 'error'
    })
  } finally {
    savingEdit.value = false
  }
}

// --- Delete ---
const deletingId = ref<number | null>(null)

async function deleteClaim(id: number) {
  // eslint-disable-next-line no-alert
  if (!confirm('Delete this claim? This cannot be undone.')) return
  deletingId.value = id
  try {
    await useApiFetch(`/api/tools/expense-claims/claims/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Claim deleted', color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({
      title: 'Could not delete claim',
      description: err instanceof Error ? err.message : 'Something went wrong.',
      color: 'error'
    })
  } finally {
    deletingId.value = null
  }
}

// --- View receipt ---
async function viewReceipt(id: number) {
  try {
    const { receiptUrl } = await useApiFetch<{ receiptUrl: string }>(`/api/tools/expense-claims/claims/${id}`)
    window.open(receiptUrl, '_blank')
  } catch {
    toast.add({ title: 'Could not open receipt', color: 'error' })
  }
}
</script>

<template>
  <div class="mt-8 space-y-8">
    <UCard>
      <template #header>
        <span class="font-medium">Submit a new claim</span>
      </template>

      <form
        class="grid grid-cols-1 sm:grid-cols-2 gap-4"
        @submit.prevent="submitClaim"
      >
        <UFormField label="Category">
          <USelect
            v-model="form.category"
            :items="EXPENSE_CATEGORY_OPTIONS"
            placeholder="Select a category"
            class="w-full"
            required
          />
        </UFormField>

        <UFormField label="Amount (RM)">
          <UInput
            v-model="form.amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            class="w-full"
            required
          />
        </UFormField>

        <UFormField label="Date of expense">
          <UInput
            v-model="form.expenseDate"
            type="date"
            class="w-full"
            required
          />
        </UFormField>

        <UFormField label="Receipt">
          <div class="flex items-center gap-3">
            <UButton
              type="button"
              variant="outline"
              color="neutral"
              size="sm"
              icon="i-lucide-upload"
              @click="fileInputRef?.click()"
            >
              Choose file
            </UButton>
            <span class="text-sm text-muted truncate">
              {{ receiptFile?.name || 'No file selected' }}
            </span>
          </div>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*,application/pdf"
            class="hidden"
            @change="onFileChange"
          >
        </UFormField>

        <UFormField
          label="Description"
          class="sm:col-span-2"
        >
          <UTextarea
            v-model="form.description"
            class="w-full"
            :rows="2"
            required
          />
        </UFormField>

        <div class="sm:col-span-2">
          <UButton
            type="submit"
            :loading="submitting"
          >
            Submit claim
          </UButton>
        </div>
      </form>
    </UCard>

    <UCard>
      <template #header>
        <span class="font-medium">My claims</span>
      </template>

      <p
        v-if="!claims?.length"
        class="text-sm text-muted"
      >
        No claims yet.
      </p>

      <div
        v-for="claim in claims"
        :key="claim.id"
        class="border-b border-default py-4 last:border-b-0"
      >
        <template v-if="editingId === claim.id">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Category">
              <USelect
                v-model="editForm.category"
                :items="EXPENSE_CATEGORY_OPTIONS"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Amount (RM)">
              <UInput
                v-model="editForm.amount"
                type="number"
                step="0.01"
                min="0"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Date of expense">
              <UInput
                v-model="editForm.expenseDate"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Replace receipt (optional)">
              <div class="flex items-center gap-3">
                <UButton
                  type="button"
                  variant="outline"
                  color="neutral"
                  size="sm"
                  icon="i-lucide-upload"
                  @click="editFileInputRef?.click()"
                >
                  Choose file
                </UButton>
                <span class="text-sm text-muted truncate">
                  {{ editReceiptFile?.name || 'Keep existing receipt' }}
                </span>
              </div>
              <input
                ref="editFileInputRef"
                type="file"
                accept="image/*,application/pdf"
                class="hidden"
                @change="onEditFileChange"
              >
            </UFormField>
            <UFormField
              label="Description"
              class="sm:col-span-2"
            >
              <UTextarea
                v-model="editForm.description"
                class="w-full"
                :rows="2"
              />
            </UFormField>
          </div>
          <div class="flex gap-2 mt-3">
            <UButton
              size="sm"
              :loading="savingEdit"
              @click="saveEdit(claim.id)"
            >
              Save
            </UButton>
            <UButton
              size="sm"
              variant="ghost"
              @click="cancelEdit"
            >
              Cancel
            </UButton>
          </div>
        </template>

        <template v-else>
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="font-medium">
                {{ EXPENSE_CATEGORY_LABELS[claim.category] ?? claim.category }}
                <UBadge
                  :color="statusColor[claim.status]"
                  variant="subtle"
                  class="ml-2"
                >
                  {{ claim.status }}
                </UBadge>
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
                <template v-if="claim.status === 'submitted'">
                  <UButton
                    size="xs"
                    variant="ghost"
                    @click="startEdit(claim)"
                  >
                    Edit
                  </UButton>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="error"
                    :loading="deletingId === claim.id"
                    @click="deleteClaim(claim.id)"
                  >
                    Delete
                  </UButton>
                </template>
              </div>
            </div>
          </div>
        </template>
      </div>
    </UCard>
  </div>
</template>
