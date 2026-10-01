<script setup lang="ts">
import type { InspectionTemplateListItem } from '~~/shared/types/inspection'

/** Report templates list (Step 12.7, admins only). Editing happens on its own page (the form builder). */

const { data, error, pending } = await useAsyncData('inspection-templates-admin', () =>
  useApiFetch<InspectionTemplateListItem[]>('/api/tools/inspection-reporting/templates')
)
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
        </li>
      </ul>
    </UCard>
  </div>
</template>
