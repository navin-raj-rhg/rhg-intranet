<script setup lang="ts">
import type { Tool } from '~/composables/useTools'

/**
 * Dashboard tile (Step 20.2): the tools this person has starred on the
 * launcher, as quick-launch buttons. Only tools they can still open show.
 */
const props = defineProps<{ tools: Tool[] }>()

const { ids } = useFavouriteTools()
const favourites = computed(() =>
  ids.value
    .map(id => props.tools.find(t => t.id === id))
    .filter((t): t is Tool => !!t)
)
const openingId = ref<string | null>(null)
</script>

<template>
  <UCard
    class="h-full"
    :ui="{ root: 'flex h-full flex-col', body: 'min-h-0 flex-1 overflow-y-auto' }"
    data-testid="favourite-tools"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon
          name="i-lucide-star"
          class="size-5 text-muted"
        />
        <span class="font-medium">Favourite tools</span>
      </div>
    </template>

    <p
      v-if="!favourites.length"
      class="text-sm text-muted"
    >
      Star a tool in the Tools list below and it will appear here.
    </p>
    <div
      v-else
      class="grid gap-2"
    >
      <UButton
        v-for="tool in favourites"
        :key="tool.id"
        :to="tool.route"
        variant="outline"
        color="neutral"
        class="justify-start"
        :icon="openingId === tool.id ? 'i-lucide-loader-circle' : (tool.icon || 'i-lucide-puzzle')"
        :ui="{ leadingIcon: openingId === tool.id ? 'animate-spin' : '' }"
        :label="tool.name"
        @click="openingId = tool.id"
      />
    </div>
  </UCard>
</template>
