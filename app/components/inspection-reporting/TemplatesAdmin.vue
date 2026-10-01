<script setup lang="ts">
import type { InspectionTemplateListItem } from '~~/shared/types/inspection'

/** Report templates list (Step 12.7, admins only). Editing happens on its own page (the form builder). */

const { data, error, pending } = await useAsyncData('inspection-templates-admin', () =>
  useApiFetch<InspectionTemplateListItem[]>('/api/tools/inspection-reporting/templates')
)

const toast = useToast()
const duplicatingId = ref<number | null>(null)

// A copy starts switched off, so the admin can edit it before inspectors see it.
async function duplicate(t: InspectionTemplateListItem) {
  duplicatingId.value = t.id
  try {
    const copy = await useApiFetch<{ id: number, name: string }>(`/api/tools/inspection-reporting/templates/${t.id}/duplicate`, { method: 'POST' })
    toast.add({ title: `Created "${copy.name}"`, description: 'It is switched off until you switch it on.', color: 'success' })
    await navigateTo(`/tools/inspection-reporting/templates/${copy.id}`)
  } catch (err) {
    toast.add({ title: 'Could not duplicate the template', description: errorText(err), color: 'error' })
  } finally {
    duplicatingId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted">
        A template is the checklist an inspector works through. Changing a template only affects reports started afterwards.
      </p>
      <UButton
        to="/tools/inspection-reporting/templates/new"
        icon="i-lucide-plus"
        label="New template"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load templates"
      :description="errorText(error)"
    />

    <UCard
      v-else
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <p
        v-if="!data?.length && !pending"
        class="p-6 text-sm text-muted"
      >
        No templates yet. Use <strong>New template</strong> to build the first one.
      </p>

      <ul v-else>
        <li
          v-for="t in data"
          :key="t.id"
          class="flex flex-wrap items-center gap-3 border-t border-default px-4 py-3 first:border-t-0"
          :data-testid="`template-${t.id}`"
        >
          <div class="min-w-0 flex-1">
            <NuxtLink
              :to="`/tools/inspection-reporting/templates/${t.id}`"
              class="font-medium text-highlighted hover:underline"
            >
              {{ t.name }}
            </NuxtLink>
            <p class="text-xs text-muted">
              {{ t.sectionCount }} section{{ t.sectionCount === 1 ? '' : 's' }} · {{ t.pointCount }} inspection point{{ t.pointCount === 1 ? '' : 's' }}
            </p>
          </div>
          <UBadge
            v-if="!t.active"
            color="neutral"
            variant="subtle"
            label="Switched off"
          />
          <UButton
            :to="`/tools/inspection-reporting/templates/${t.id}`"
            size="sm"
            variant="outline"
            color="neutral"
            icon="i-lucide-pencil"
            label="Edit"
          />
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-lucide-copy"
            label="Duplicate"
            :loading="duplicatingId === t.id"
            :data-testid="`duplicate-${t.id}`"
            @click="duplicate(t)"
          />
        </li>
      </ul>
    </UCard>
  </div>
</template>
