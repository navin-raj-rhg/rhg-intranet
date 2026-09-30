<script setup lang="ts">
/**
 * Cost Model tab (Step 11.8). The URL decides what's shown, so a saved model
 * has its own shareable link and the browser Back button works:
 *   ?model=12  -> that saved model, read-only
 *   (nothing)  -> the list of saved models
 */
const route = useRoute()
const router = useRouter()

const modelId = computed(() => {
  const n = Number(route.query.model)
  return Number.isInteger(n) && n > 0 ? n : null
})

function openModel(id: number) {
  router.push({ query: { ...route.query, tab: undefined, model: String(id) } })
}

function backToList() {
  const { model: _model, ...rest } = route.query
  router.push({ query: rest })
}
</script>

<template>
  <div class="mt-8">
    <CostModellingModelView
      v-if="modelId"
      :key="modelId"
      :model-id="modelId"
      @back="backToList"
      @open="openModel"
    />
    <CostModellingModelList
      v-else
      @open="openModel"
    />
  </div>
</template>
