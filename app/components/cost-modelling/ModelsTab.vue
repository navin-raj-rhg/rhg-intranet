<script setup lang="ts">
/**
 * Cost Model tab (Step 11.8). The URL decides what's shown, so a saved model
 * has its own shareable link and the browser Back button works:
 *   ?model=12  -> that saved model, read-only
 *   ?new=1     -> the new cost model form
 *   ?new=1&from=12 -> the form prefilled from model 12 (Duplicate)
 *   (nothing)  -> the list of saved models
 */
const route = useRoute()
const router = useRouter()

const modelId = computed(() => {
  const n = Number(route.query.model)
  return Number.isInteger(n) && n > 0 ? n : null
})

const isNew = computed(() => route.query.new === '1')
const fromId = computed(() => {
  const n = Number(route.query.from)
  return Number.isInteger(n) && n > 0 ? n : null
})

function openModel(id: number) {
  router.push({ query: { model: String(id) } })
}

function newModel() {
  router.push({ query: { new: '1' } })
}

function duplicateModel(id: number) {
  router.push({ query: { new: '1', from: String(id) } })
}

// After saving, replace the form in history so Back doesn't reopen an empty form.
function savedModel(id: number) {
  router.replace({ query: { model: String(id) } })
}

function backToList() {
  router.push({ query: {} })
}

// After deleting, replace the (now missing) model in history.
function afterDelete() {
  router.replace({ query: {} })
}
</script>

<template>
  <div class="mt-8">
    <CostModellingModelForm
      v-if="isNew"
      :key="`new-${fromId ?? ''}`"
      :from-id="fromId"
      @saved="savedModel"
      @cancel="backToList"
      @open="openModel"
    />
    <CostModellingModelView
      v-else-if="modelId"
      :key="modelId"
      :model-id="modelId"
      @back="backToList"
      @open="openModel"
      @duplicate="duplicateModel"
      @deleted="afterDelete"
    />
    <CostModellingModelList
      v-else
      @open="openModel"
      @new="newModel"
    />
  </div>
</template>
