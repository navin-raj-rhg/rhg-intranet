<script setup lang="ts">
import { COMMENT_MAX_CHARS, POST_MAX_CHARS, postTextProblem, type PostComment, type PostView, type ReactionSummary } from '~~/shared/utils/postRules'

// One post on the dashboard: text, images, reactions, edit / delete / pin and its
// comments (loaded when opened). The parent list keeps the posts; this card tells
// it what changed ('patch') or that the post is gone ('deleted' / 'pin-changed').
const props = defineProps<{ post: PostView, isOwner: boolean }>()
const emit = defineEmits<{
  patch: [changes: Partial<PostView>]
  deleted: []
  pinChanged: []
}>()

const toast = useToast()
const base = computed(() => `/api/dashboard/posts/${props.post.id}`)

/* ---- reactions ---- */

const reacting = ref(false)

async function reactToPost(emoji: string) {
  reacting.value = true
  try {
    const reactions = await useApiFetch<ReactionSummary[]>(`${base.value}/reactions`, { method: 'POST', body: { emoji } })
    emit('patch', { reactions })
  } catch (err) {
    toast.add({ title: 'Couldn\'t save your reaction', description: errorText(err), color: 'error' })
  } finally {
    reacting.value = false
  }
}

/* ---- editing the post ---- */

const editing = ref(false)
const draft = ref('')
const savingEdit = ref(false)

function startEdit() {
  draft.value = props.post.body
  editing.value = true
}

async function saveEdit() {
  const problem = postTextProblem(draft.value, POST_MAX_CHARS, props.post.images.length > 0)
  if (problem) return void toast.add({ title: problem, color: 'error' })
  savingEdit.value = true
  try {
    await useApiFetch(base.value, { method: 'PUT', body: { body: draft.value } })
    emit('patch', { body: cleanPostText(draft.value), edited: true })
    editing.value = false
  } catch (err) {
    toast.add({ title: 'Couldn\'t save the change', description: errorText(err), color: 'error' })
  } finally {
    savingEdit.value = false
  }
}

/* ---- pin ---- */

const pinning = ref(false)

async function togglePin() {
  pinning.value = true
  try {
    await useApiFetch(`${base.value}/pin`, { method: 'PUT', body: { pinned: !props.post.pinned } })
    emit('pinChanged')
  } catch (err) {
    toast.add({ title: 'Couldn\'t change the pin', description: errorText(err), color: 'error' })
  } finally {
    pinning.value = false
  }
}

/* ---- comments ---- */

const showComments = ref(false)
const comments = ref<PostComment[]>([])
const commentsLoading = ref(false)
const newComment = ref('')
const addingComment = ref(false)
const editingCommentId = ref<number | null>(null)
const commentDraft = ref('')
const busyCommentId = ref<number | null>(null)

async function loadComments() {
  commentsLoading.value = true
  try {
    comments.value = await useApiFetch<PostComment[]>(`${base.value}/comments`)
    emit('patch', { commentCount: comments.value.length })
  } catch (err) {
    toast.add({ title: 'Couldn\'t load the comments', description: errorText(err), color: 'error' })
  } finally {
    commentsLoading.value = false
  }
}

async function toggleComments() {
  showComments.value = !showComments.value
  if (showComments.value) await loadComments()
}

async function addComment() {
  const problem = postTextProblem(newComment.value, COMMENT_MAX_CHARS)
  if (problem) return void toast.add({ title: problem, color: 'error' })
  addingComment.value = true
  try {
    await useApiFetch(`${base.value}/comments`, { method: 'POST', body: { body: newComment.value } })
    newComment.value = ''
    await loadComments()
  } catch (err) {
    toast.add({ title: 'Couldn\'t add the comment', description: errorText(err), color: 'error' })
  } finally {
    addingComment.value = false
  }
}

function startEditComment(c: PostComment) {
  editingCommentId.value = c.id
  commentDraft.value = c.body
}

async function saveComment(c: PostComment) {
  const problem = postTextProblem(commentDraft.value, COMMENT_MAX_CHARS)
  if (problem) return void toast.add({ title: problem, color: 'error' })
  busyCommentId.value = c.id
  try {
    await useApiFetch(`/api/dashboard/post-comments/${c.id}`, { method: 'PUT', body: { body: commentDraft.value } })
    editingCommentId.value = null
    await loadComments()
  } catch (err) {
    toast.add({ title: 'Couldn\'t save the change', description: errorText(err), color: 'error' })
  } finally {
    busyCommentId.value = null
  }
}

async function reactToComment(c: PostComment, emoji: string) {
  busyCommentId.value = c.id
  try {
    c.reactions = await useApiFetch<ReactionSummary[]>(`/api/dashboard/post-comments/${c.id}/reactions`, { method: 'POST', body: { emoji } })
  } catch (err) {
    toast.add({ title: 'Couldn\'t save your reaction', description: errorText(err), color: 'error' })
  } finally {
    busyCommentId.value = null
  }
}

/* ---- delete (post or comment), with our own confirm box ---- */

const confirm = reactive<{ open: boolean, commentId: number | null, working: boolean }>({ open: false, commentId: null, working: false })

function askDeletePost() {
  confirm.commentId = null
  confirm.open = true
}

function askDeleteComment(c: PostComment) {
  confirm.commentId = c.id
  confirm.open = true
}

async function doDelete() {
  confirm.working = true
  try {
    if (confirm.commentId === null) {
      await useApiFetch(base.value, { method: 'DELETE' })
      confirm.open = false
      emit('deleted')
    } else {
      await useApiFetch(`/api/dashboard/post-comments/${confirm.commentId}`, { method: 'DELETE' })
      confirm.open = false
      await loadComments()
    }
  } catch (err) {
    toast.add({ title: 'Couldn\'t delete it', description: errorText(err), color: 'error' })
  } finally {
    confirm.working = false
  }
}

const when = (iso: string) => formatDateTimeMY(new Date(iso))
</script>

<template>
  <article
    class="space-y-2 py-4 first:pt-0"
    :data-testid="`post-${post.id}`"
  >
    <div class="flex items-start gap-3">
      <UAvatar
        :alt="post.authorName"
        size="sm"
      />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2">
          <span class="font-medium">{{ post.authorName }}</span>
          <span class="text-xs text-muted">{{ when(post.createdAt) }}<template v-if="post.edited"> · edited</template></span>
          <UBadge
            v-if="post.pinned"
            size="sm"
            variant="subtle"
            icon="i-lucide-pin"
            label="Pinned"
          />
        </div>

        <div
          v-if="editing"
          class="mt-1 space-y-2"
        >
          <UTextarea
            v-model="draft"
            class="w-full"
            autoresize
            :rows="2"
            :maxlength="POST_MAX_CHARS + 500"
          />
          <div class="flex gap-2">
            <UButton
              size="xs"
              label="Save"
              :loading="savingEdit"
              @click="saveEdit"
            />
            <UButton
              size="xs"
              variant="outline"
              color="neutral"
              label="Cancel"
              @click="editing = false"
            />
          </div>
        </div>
        <p
          v-else-if="post.body"
          class="mt-1 whitespace-pre-wrap break-words text-sm"
        >
          {{ post.body }}
        </p>

        <div
          v-if="post.images.length"
          class="mt-2 grid grid-cols-2 gap-2"
        >
          <a
            v-for="img in post.images"
            :key="img.id"
            :href="img.url"
            target="_blank"
            rel="noopener"
            class="block overflow-hidden rounded-md border border-default"
          >
            <img
              :src="img.url"
              :alt="img.fileName"
              loading="lazy"
              class="h-40 w-full object-cover"
            >
          </a>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-2">
          <DashboardReactionBar
            :reactions="post.reactions"
            :busy="reacting"
            @toggle="reactToPost"
          />
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-message-circle"
            :label="post.commentCount ? `${post.commentCount} ${post.commentCount === 1 ? 'comment' : 'comments'}` : 'Comment'"
            :aria-expanded="showComments"
            @click="toggleComments"
          />
          <span class="flex-1" />
          <UButton
            v-if="isOwner"
            size="xs"
            variant="ghost"
            color="neutral"
            :icon="post.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin'"
            :aria-label="post.pinned ? 'Unpin this post' : 'Pin this post'"
            :loading="pinning"
            @click="togglePin"
          />
          <UButton
            v-if="post.canEdit && !editing"
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-pencil"
            aria-label="Edit your post"
            @click="startEdit"
          />
          <UButton
            v-if="post.canDelete"
            size="xs"
            variant="ghost"
            color="error"
            icon="i-lucide-trash-2"
            aria-label="Delete this post"
            @click="askDeletePost"
          />
        </div>

        <!-- Comments -->
        <div
          v-if="showComments"
          class="mt-3 space-y-3 border-l-2 border-default pl-3"
        >
          <p
            v-if="commentsLoading && !comments.length"
            class="text-sm text-muted"
          >
            Loading…
          </p>
          <div
            v-for="c in comments"
            :key="c.id"
            class="space-y-1"
            :data-testid="`comment-${c.id}`"
          >
            <div class="flex flex-wrap items-center gap-x-2">
              <span class="text-sm font-medium">{{ c.authorName }}</span>
              <span class="text-xs text-muted">{{ when(c.createdAt) }}<template v-if="c.edited"> · edited</template></span>
            </div>
            <div
              v-if="editingCommentId === c.id"
              class="space-y-2"
            >
              <UTextarea
                v-model="commentDraft"
                class="w-full"
                autoresize
                :rows="2"
              />
              <div class="flex gap-2">
                <UButton
                  size="xs"
                  label="Save"
                  :loading="busyCommentId === c.id"
                  @click="saveComment(c)"
                />
                <UButton
                  size="xs"
                  variant="outline"
                  color="neutral"
                  label="Cancel"
                  @click="editingCommentId = null"
                />
              </div>
            </div>
            <p
              v-else
              class="whitespace-pre-wrap break-words text-sm"
            >
              {{ c.body }}
            </p>
            <div class="flex flex-wrap items-center gap-1">
              <DashboardReactionBar
                :reactions="c.reactions"
                :busy="busyCommentId === c.id"
                @toggle="reactToComment(c, $event)"
              />
              <span class="flex-1" />
              <UButton
                v-if="c.canEdit && editingCommentId !== c.id"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-pencil"
                aria-label="Edit your comment"
                @click="startEditComment(c)"
              />
              <UButton
                v-if="c.canDelete"
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                aria-label="Delete this comment"
                @click="askDeleteComment(c)"
              />
            </div>
          </div>

          <form
            class="flex items-start gap-2"
            @submit.prevent="addComment"
          >
            <UTextarea
              v-model="newComment"
              class="flex-1"
              autoresize
              :rows="1"
              placeholder="Write a comment…"
              aria-label="Write a comment"
              @keydown.enter.exact.prevent="addComment"
            />
            <UButton
              type="submit"
              size="sm"
              label="Send"
              :loading="addingComment"
              :disabled="!newComment.trim()"
            />
          </form>
        </div>
      </div>
    </div>

    <UModal
      v-model:open="confirm.open"
      :title="confirm.commentId === null ? 'Delete this post?' : 'Delete this comment?'"
      :description="confirm.commentId === null ? 'The post, its images, comments and reactions will be removed. This can\'t be undone.' : 'This can\'t be undone.'"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="outline"
            color="neutral"
            label="Cancel"
            @click="confirm.open = false"
          />
          <UButton
            color="error"
            label="Delete"
            :loading="confirm.working"
            @click="doDelete"
          />
        </div>
      </template>
    </UModal>
  </article>
</template>
