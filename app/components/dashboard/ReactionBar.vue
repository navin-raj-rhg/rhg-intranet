<script setup lang="ts">
import { POST_REACTION_EMOJIS, type ReactionSummary } from '~~/shared/utils/postRules'

// The reactions on a post or comment: one button per emoji in use (highlighted if
// you gave it) plus a "+" that opens the six available emojis. Clicking one gives
// the reaction, clicking it again takes it back.
defineProps<{ reactions: ReactionSummary[], busy?: boolean }>()
const emit = defineEmits<{ toggle: [emoji: string] }>()

const picking = ref(false)

function pick(emoji: string) {
  picking.value = false
  emit('toggle', emoji)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1">
    <UButton
      v-for="r in reactions"
      :key="r.emoji"
      size="xs"
      :variant="r.mine ? 'soft' : 'outline'"
      :color="r.mine ? 'primary' : 'neutral'"
      :disabled="busy"
      :aria-label="`${r.emoji} ${r.count}${r.mine ? ', given by you' : ''}`"
      :aria-pressed="r.mine"
      @click="emit('toggle', r.emoji)"
    >
      <span>{{ r.emoji }}</span>
      <span class="text-xs">{{ r.count }}</span>
    </UButton>

    <template v-if="picking">
      <UButton
        v-for="emoji in POST_REACTION_EMOJIS"
        :key="emoji"
        size="xs"
        variant="ghost"
        color="neutral"
        :aria-label="`React with ${emoji}`"
        @click="pick(emoji)"
      >
        {{ emoji }}
      </UButton>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        aria-label="Close reactions"
        @click="picking = false"
      />
    </template>
    <UButton
      v-else
      size="xs"
      variant="ghost"
      color="neutral"
      icon="i-lucide-smile-plus"
      aria-label="Add a reaction"
      :disabled="busy"
      @click="picking = true"
    />
  </div>
</template>
