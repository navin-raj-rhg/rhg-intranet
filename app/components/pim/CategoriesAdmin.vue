<script setup lang="ts">
import type { PimCategoryItem } from '~~/shared/types/pim'
import { PIM_SHORT_TEXT_MAX } from '~~/shared/utils/pimRules'

/**
 * Categories & attributes setup (Step 17.5, admins only). Each category has
 * sub-categories, the built-in fields a complete product needs, and its own
 * extra fields (attributes). Anything in use is switched off, never deleted.
 */

const toast = useToast()

const { data, error, refresh } = await useAsyncData('pim-categories', () =>
  useApiFetch<PimCategoryItem[]>('/api/tools/pim/categories')
)

const newName = ref('')
const adding = ref(false)

async function add() {
  const name = newName.value.trim()
  if (!name) {
    toast.add({ title: 'Enter a name first', color: 'warning' })
    return
  }
  adding.value = true
  try {
    await useApiFetch('/api/tools/pim/categories', { method: 'POST', body: { name } })
    newName.value = ''
    await refresh()
    toast.add({ title: `Added ${name}`, description: 'Add its sub-categories, required fields and attributes below.', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Couldn\'t add it', description: errorText(err), color: 'error' })
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn't load categories"
      :description="errorText(error)"
    />

    <template v-else>
      <UCard>
        <form
          class="flex flex-col gap-3 sm:flex-row sm:items-end"
          @submit.prevent="add"
        >
          <UFormField
            label="New category"
            class="flex-1"
          >
            <UInput
              v-model="newName"
              :maxlength="PIM_SHORT_TEXT_MAX"
              placeholder="e.g. Hand tools"
              class="w-full"
              data-testid="category-name"
            />
          </UFormField>
          <UButton
            type="submit"
            icon="i-lucide-plus"
            label="Add"
            :loading="adding"
          />
        </form>
      </UCard>

      <p
        v-if="!data?.length"
        class="text-sm text-muted"
      >
        No categories yet. Add the first one above.
      </p>

      <PimCategoryCard
        v-for="c in data"
        :key="c.id"
        :category="c"
        @changed="refresh"
      />

      <p class="text-sm text-muted">
        A category or attribute that products use can be switched off but not deleted. Switching off hides it from new
        and edited products; products already using it keep their values.
      </p>
    </template>
  </div>
</template>
