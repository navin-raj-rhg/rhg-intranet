<script setup lang="ts">
import type { ProjectCommentItem, ProjectFileItem } from '~~/shared/types/projects'
import { PROJECT_FILE_EXTENSIONS, PROJECT_FILE_MAX_BYTES } from '~~/shared/utils/projectFiles'
import { PROJECT_TEXT_MAX } from '~~/shared/utils/projectRules'

/**
 * Comments and attached files for one task (Step 16.8), shown under the task in
 * the edit dialog. Anyone in the project can comment and attach files; files can
 * be removed by whoever attached them, the project owner or an admin.
 */

const props = defineProps<{ projectId: number, taskId: number, editable: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const { uploadFile } = useProjectFiles()
const base = computed(() => `/api/tools/projects/${props.projectId}/tasks/${props.taskId}`)

const comments = ref<ProjectCommentItem[]>([])
const files = ref<ProjectFileItem[]>([])
const loading = ref(true)
const loadError = ref('')

async function load() {
  try {
    const [c, f] = await Promise.all([
      useApiFetch<ProjectCommentItem[]>(`${base.value}/comments`),
      useApiFetch<ProjectFileItem[]>(`${base.value}/files`)
    ])
    comments.value = c
    files.value = f
    loadError.value = ''
  } catch (err) {
    loadError.value = errorText(err)
  } finally {
    loading.value = false
  }
}
onMounted(load)

/* ---- comments ---- */

const draft = ref('')
const posting = ref(false)

async function postComment() {
  const body = draft.value.trim()
  if (!body) return
  posting.value = true
  try {
    await useApiFetch(`${base.value}/comments`, { method: 'POST', body: { body } })
    draft.value = ''
    await load()
    emit('changed')
  } catch (err) {
    toast.add({ title: 'Couldn\'t add the comment', description: errorText(err), color: 'error' })
  } finally {
    posting.value = false
  }
}

/* ---- files ---- */

const picker = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const busyFileId = ref<number | null>(null)
const accept = PROJECT_FILE_EXTENSIONS.map(e => `.${e}`).join(',')

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const picked = [...(input.files ?? [])]
  input.value = ''
  if (!picked.length) return
  uploading.value = true
  try {
    for (const file of picked) {
      try {
        await uploadFile(props.projectId, props.taskId, file)
      } catch (err) {
        toast.add({ title: 'Couldn\'t attach a file', description: (err as Error).message || errorText(err), color: 'error' })
      }
    }
    await load()
    emit('changed')
  } finally {
    uploading.value = false
  }
}

async function openFile(f: ProjectFileItem) {
  busyFileId.value = f.id
  try {
    const { downloadUrl } = await useApiFetch<{ downloadUrl: string }>(`${base.value}/files/${f.id}/download-url`)
    window.open(downloadUrl, '_blank')
  } catch (err) {
    toast.add({ title: 'Couldn\'t open the file', description: errorText(err), color: 'error' })
  } finally {
    busyFileId.value = null
  }
}

async function removeFile(f: ProjectFileItem) {
  busyFileId.value = f.id
  try {
    await useApiFetch(`${base.value}/files/${f.id}`, { method: 'DELETE' })
    await load()
    emit('changed')
  } catch (err) {
    toast.add({ title: 'Couldn\'t remove the file', description: errorText(err), color: 'error' })
  } finally {
    busyFileId.value = null
  }
}
</script>

<template>
  <div class="space-y-6 border-t border-default pt-4">
    <UAlert
      v-if="loadError"
      color="error"
      variant="subtle"
      title="Couldn't load comments and files"
      :description="loadError"
    />

    <!-- Files -->
    <section class="space-y-2">
      <div class="flex items-center gap-2">
        <h4 class="flex-1 font-semibold">
          Files
        </h4>
        <template v-if="editable">
          <input
            ref="picker"
            type="file"
            multiple
            class="hidden"
            :accept="accept"
            data-testid="file-input"
            @change="onPick"
          >
          <UButton
            size="sm"
            variant="outline"
            color="neutral"
            icon="i-lucide-paperclip"
            label="Attach file"
            :loading="uploading"
            data-testid="attach-file"
            @click="picker?.click()"
          />
        </template>
      </div>

      <p
        v-if="!loading && !files.length"
        class="text-sm text-muted"
      >
        No files attached.
      </p>
      <ul
        v-else
        class="divide-y divide-default rounded-md border border-default"
      >
        <li
          v-for="f in files"
          :key="f.id"
          class="flex flex-wrap items-center gap-2 px-3 py-2"
          :data-testid="`file-${f.id}`"
        >
          <button
            type="button"
            class="min-w-0 flex-1 text-left"
            :disabled="busyFileId === f.id"
            @click="openFile(f)"
          >
            <span class="block font-medium break-words text-highlighted hover:underline">{{ f.fileName }}</span>
            <span class="text-xs text-muted">{{ formatBytes(f.sizeBytes) }} · {{ f.uploadedByName }} · {{ formatDateTimeMY(new Date(f.createdAt)) }}</span>
          </button>
          <UButton
            v-if="f.canRemove && editable"
            size="xs"
            variant="ghost"
            color="error"
            icon="i-lucide-trash-2"
            aria-label="Remove file"
            :loading="busyFileId === f.id"
            @click="removeFile(f)"
          />
        </li>
      </ul>
      <p
        v-if="editable"
        class="text-xs text-muted"
      >
        Images, PDF, Word, Excel, PowerPoint, CSV, text and ZIP files, up to {{ PROJECT_FILE_MAX_BYTES / 1024 / 1024 }} MB each.
      </p>
    </section>

    <!-- Comments -->
    <section class="space-y-3">
      <h4 class="font-semibold">
        Comments
      </h4>
      <p
        v-if="!loading && !comments.length"
        class="text-sm text-muted"
      >
        No comments yet.
      </p>
      <ul
        v-else
        class="space-y-3"
      >
        <li
          v-for="c in comments"
          :key="c.id"
          class="rounded-md bg-elevated/50 px-3 py-2"
          :data-testid="`comment-${c.id}`"
        >
          <p class="text-xs text-muted">
            <span class="font-medium text-default">{{ c.authorName }}</span> · {{ formatDateTimeMY(new Date(c.createdAt)) }}
          </p>
          <p class="text-sm break-words whitespace-pre-line">
            {{ c.body }}
          </p>
        </li>
      </ul>

      <form
        v-if="editable"
        class="space-y-2"
        @submit.prevent="postComment"
      >
        <UTextarea
          v-model="draft"
          :rows="2"
          autoresize
          :maxlength="PROJECT_TEXT_MAX"
          placeholder="Write a comment"
          class="w-full"
          aria-label="New comment"
          data-testid="comment-input"
        />
        <UButton
          type="submit"
          size="sm"
          icon="i-lucide-send"
          label="Add comment"
          :loading="posting"
          :disabled="!draft.trim()"
          data-testid="comment-post"
        />
      </form>
    </section>
  </div>
</template>
