<script setup lang="ts">
/**
 * Owner-only storage clean-up (Step 13.10): lists files in R2 that no claim,
 * leave application, payroll report or inspection photo points to any more
 * (abandoned uploads, replaced receipts) and are over a day old. Nothing is
 * deleted until the owner confirms, and deleting is permanent.
 */
interface OrphanList {
  totalCount: number
  totalBytes: number
  items: { key: string, size: number, lastModified: string }[]
}

const authStore = useAuthStore()
const toast = useToast()

const data = ref<OrphanList | null>(null)
const scanning = ref(false)
const scanError = ref('')

async function scan() {
  scanning.value = true
  scanError.value = ''
  try {
    data.value = await useApiFetch<OrphanList>('/api/admin/storage/orphans')
  } catch (err) {
    scanError.value = errorText(err)
  } finally {
    scanning.value = false
  }
}

const confirmOpen = ref(false)
const deleting = ref(false)

async function deleteListed() {
  if (!data.value) return
  deleting.value = true
  try {
    const result = await useApiFetch<{ deleted: number, skipped: number, freedBytes: number }>(
      '/api/admin/storage/orphans/delete',
      { method: 'POST', body: { keys: data.value.items.map(i => i.key) } }
    )
    toast.add({
      title: `Deleted ${result.deleted} file${result.deleted === 1 ? '' : 's'} (${formatBytes(result.freedBytes)})`,
      description: result.skipped ? `${result.skipped} skipped because they are now in use or too recent.` : undefined,
      color: 'success'
    })
    confirmOpen.value = false
    await scan()
  } catch (err) {
    toast.add({ title: 'Could not delete the files', description: errorText(err), color: 'error' })
  } finally {
    deleting.value = false
  }
}

const dateOf = (iso: string) => formatDateMY(todayMY(new Date(iso)))
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
      title="Storage clean-up"
      description="Find files that nothing uses any more (abandoned uploads, replaced receipts) and delete them to free space."
    />

    <UAlert
      v-if="!authStore.profile?.isOwner"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Owner access required"
      description="Only the workspace owner can clean up storage."
    />

    <template v-else>
      <UCard class="mt-8">
        <p class="text-sm text-muted">
          A file counts as unused when no expense claim, payroll report, leave application or inspection photo points to
          it and it is more than a day old. Only files saved by the tools are looked at. Look at the list first - deleting is permanent.
        </p>
        <div class="mt-4">
          <UButton
            icon="i-lucide-search"
            :label="data ? 'Scan again' : 'Scan for unused files'"
            :loading="scanning"
            data-testid="scan"
            @click="scan"
          />
        </div>
      </UCard>

      <UAlert
        v-if="scanError"
        class="mt-6"
        color="error"
        variant="subtle"
        title="Could not scan"
        :description="scanError"
      />

      <UCard
        v-if="data"
        class="mt-6"
      >
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="font-medium">
              <template v-if="data.totalCount">
                {{ data.totalCount }} unused file{{ data.totalCount === 1 ? '' : 's' }} ({{ formatBytes(data.totalBytes) }})
              </template>
              <template v-else>
                No unused files found
              </template>
            </p>
            <UButton
              v-if="data.totalCount"
              color="error"
              icon="i-lucide-trash-2"
              :label="`Delete ${data.items.length} file${data.items.length === 1 ? '' : 's'}`"
              data-testid="delete-listed"
              @click="confirmOpen = true"
            />
          </div>
        </template>

        <p
          v-if="data.totalCount > data.items.length"
          class="mb-3 text-sm text-muted"
        >
          Showing the oldest {{ data.items.length }}. Delete these, then scan again for the rest.
        </p>

        <ul
          v-if="data.items.length"
          class="divide-y divide-default text-sm"
        >
          <li
            v-for="item in data.items"
            :key="item.key"
            class="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <span class="min-w-0 truncate font-mono text-xs">{{ item.key }}</span>
            <span class="shrink-0 text-muted">{{ formatBytes(item.size) }} · {{ dateOf(item.lastModified) }}</span>
          </li>
        </ul>
      </UCard>
    </template>

    <UModal
      v-model:open="confirmOpen"
      title="Delete these files permanently?"
    >
      <template #body>
        <p class="text-sm">
          {{ data?.items.length }} file{{ data?.items.length === 1 ? '' : 's' }} will be deleted from storage and can't be
          recovered. Each one is checked again first, and anything that is in use after all is skipped.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :disabled="deleting"
            @click="confirmOpen = false"
          />
          <UButton
            label="Delete files"
            color="error"
            icon="i-lucide-trash-2"
            :loading="deleting"
            @click="deleteListed"
          />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
