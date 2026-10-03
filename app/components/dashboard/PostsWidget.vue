<script setup lang="ts">
import { POST_MAX_CHARS, POST_MAX_IMAGES, postImageProblem, postTextProblem, type PostView } from '~~/shared/utils/postRules'

// Dashboard Posts (Step 18): anyone can post text and up to 4 images; everyone
// can comment and react. The composer stays at the top; the list scrolls inside
// the card so the dashboard layout can give it a fixed height.
const authStore = useAuthStore()
const toast = useToast()
const { uploadImage } = usePostImages()

const isOwner = computed(() => !!authStore.profile?.isOwner)

const posts = ref<PostView[]>([])
const hasMore = ref(false)
const loading = ref(true)
const loadingMore = ref(false)
const loadError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await useApiFetch<{ posts: PostView[], hasMore: boolean }>('/api/dashboard/posts')
    posts.value = res.posts
    hasMore.value = res.hasMore
  } catch (err) {
    loadError.value = errorText(err)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  const oldest = posts.value.filter(p => !p.pinned).at(-1)
  if (!oldest) return
  loadingMore.value = true
  try {
    const res = await useApiFetch<{ posts: PostView[], hasMore: boolean }>('/api/dashboard/posts', { query: { before: oldest.id } })
    const have = new Set(posts.value.map(p => p.id))
    posts.value = [...posts.value, ...res.posts.filter(p => !have.has(p.id))]
    hasMore.value = res.hasMore
  } catch (err) {
    toast.add({ title: 'Couldn\'t load older posts', description: errorText(err), color: 'error' })
  } finally {
    loadingMore.value = false
  }
}

await useAsyncData('dashboard-posts', async () => {
  await load()
  return true
})

function patchPost(id: number, changes: Partial<PostView>) {
  posts.value = posts.value.map(p => (p.id === id ? { ...p, ...changes } : p))
}

function removePost(id: number) {
  posts.value = posts.value.filter(p => p.id !== id)
}

/* ---- composer ---- */

const text = ref('')
const picked = ref<{ file: File, preview: string }[]>([])
const posting = ref(false)
const picker = ref<HTMLInputElement | null>(null)

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  for (const file of files) {
    if (picked.value.length >= POST_MAX_IMAGES) {
      toast.add({ title: `A post can have up to ${POST_MAX_IMAGES} images`, color: 'warning' })
      break
    }
    const problem = postImageProblem(file.name, file.size)
    if (problem) {
      toast.add({ title: `Couldn't add ${file.name}`, description: problem, color: 'error' })
      continue
    }
    picked.value.push({ file, preview: URL.createObjectURL(file) })
  }
}

function dropPicked(index: number) {
  const [removed] = picked.value.splice(index, 1)
  if (removed) URL.revokeObjectURL(removed.preview)
}

onBeforeUnmount(() => picked.value.forEach(p => URL.revokeObjectURL(p.preview)))

const canPost = computed(() => !!text.value.trim() || picked.value.length > 0)

async function submit() {
  const problem = postTextProblem(text.value, POST_MAX_CHARS, picked.value.length > 0)
  if (problem) return void toast.add({ title: problem, color: 'error' })
  posting.value = true
  try {
    const images: { key: string, fileName: string }[] = []
    for (const p of picked.value) images.push(await uploadImage(p.file))
    await useApiFetch('/api/dashboard/posts', { method: 'POST', body: { body: text.value, images } })
    text.value = ''
    picked.value.forEach(p => URL.revokeObjectURL(p.preview))
    picked.value = []
    await load()
  } catch (err) {
    toast.add({ title: 'Couldn\'t post', description: (err as Error).message || errorText(err), color: 'error' })
  } finally {
    posting.value = false
  }
}
</script>

<template>
  <UCard
    class="h-full"
    :ui="{ root: 'flex h-full flex-col', body: 'min-h-0 flex-1 overflow-y-auto' }"
    data-testid="posts-widget"
  >
    <template #header>
      <div class="space-y-2">
        <span class="font-medium">Posts</span>
        <form
          class="space-y-2"
          @submit.prevent="submit"
        >
          <UTextarea
            v-model="text"
            class="w-full"
            autoresize
            :rows="2"
            :maxlength="POST_MAX_CHARS + 500"
            placeholder="Share something with the team…"
            aria-label="Write a post"
          />
          <div
            v-if="picked.length"
            class="flex flex-wrap gap-2"
          >
            <div
              v-for="(p, i) in picked"
              :key="p.preview"
              class="relative"
            >
              <img
                :src="p.preview"
                :alt="p.file.name"
                class="size-16 rounded-md border border-default object-cover"
              >
              <UButton
                size="xs"
                color="neutral"
                variant="solid"
                icon="i-lucide-x"
                class="absolute -right-2 -top-2 rounded-full"
                :aria-label="`Remove ${p.file.name}`"
                @click="dropPicked(i)"
              />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <input
              ref="picker"
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              multiple
              class="hidden"
              @change="onPick"
            >
            <UButton
              size="sm"
              variant="outline"
              color="neutral"
              icon="i-lucide-image-plus"
              label="Add images"
              :disabled="posting || picked.length >= POST_MAX_IMAGES"
              @click="picker?.click()"
            />
            <span class="flex-1" />
            <UButton
              type="submit"
              size="sm"
              label="Post"
              :loading="posting"
              :disabled="!canPost"
            />
          </div>
        </form>
      </div>
    </template>

    <p
      v-if="loadError"
      class="text-sm text-error"
    >
      Couldn't load posts: {{ loadError }}
    </p>
    <p
      v-else-if="loading && !posts.length"
      class="text-sm text-muted"
    >
      Loading…
    </p>
    <p
      v-else-if="!posts.length"
      class="text-sm text-muted"
    >
      No posts yet. Be the first to share something.
    </p>
    <div
      v-else
      class="divide-y divide-default"
    >
      <DashboardPostCard
        v-for="post in posts"
        :key="post.id"
        :post="post"
        :is-owner="isOwner"
        @patch="patchPost(post.id, $event)"
        @deleted="removePost(post.id)"
        @pin-changed="load"
      />
      <div
        v-if="hasMore"
        class="pt-4 text-center"
      >
        <UButton
          variant="outline"
          color="neutral"
          size="sm"
          label="Load more"
          :loading="loadingMore"
          @click="loadMore"
        />
      </div>
    </div>
  </UCard>
</template>
