<script setup lang="ts">
import type { PimFileItem } from '~~/shared/types/pim'
import { PROJECT_FILE_EXTENSIONS, PROJECT_FILE_MAX_BYTES } from '~~/shared/utils/projectFiles'
import { formatBytes } from '~~/shared/utils/storageCleanup'
import type { PimFileKind } from '~~/shared/utils/pimRules'

/**
 * A product's images (gallery with one main image) and documents (spec sheets,
 * certificates, manuals...) - Step 17.8. Editors and admins can add, remove and
 * choose the main image; everyone can open them.
 */

const props = defineProps<{ productId: number, files: PimFileItem[], canEdit: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()
const { uploadPimFile } = usePimFiles()

const images = computed(() => props.files.filter(f => f.kind === 'image'))
const documents = computed(() => props.files.filter(f => f.kind === 'document'))

const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.heic,.heif,.webp,.gif'
const DOC_ACCEPT = PROJECT_FILE_EXTENSIONS.map(e => `.${e}`).join(',')

const imagePicker = ref<HTMLInputElement | null>(null)
const docPicker = ref<HTMLInputElement | null>(null)
const uploading = ref<PimFileKind | null>(null)
const busyId = ref<number | null>(null)
// Browsers can't draw some formats (HEIC); those show an icon instead of a broken picture.
const broken = ref(new Set<number>())

async function onPick(e: Event, kind: PimFileKind) {
  const input = e.target as HTMLInputElement
  const picked = [...(input.files ?? [])]
  input.value = ''
  if (!picked.length) return
  uploading.value = kind
  try {
    for (const file of picked) {
      try {
        await uploadPimFile(props.productId, file, kind)
      } catch (err) {
        toast.add({ title: 'Couldn\'t add a file', description: (err as Error).message || errorText(err), color: 'error' })
      }
    }
    emit('changed')
  } finally {
    uploading.value = null
  }
}

async function makeMain(f: PimFileItem) {
  busyId.value = f.id
  try {
    await useApiFetch(`/api/tools/pim/products/${props.productId}/files/${f.id}/main`, { method: 'POST' })
    emit('changed')
  } catch (err) {
    toast.add({ title: 'Couldn\'t change the main image', description: errorText(err), color: 'error' })
  } finally {
    busyId.value = null
  }
}

const confirm = reactive({ open: false, file: null as PimFileItem | null })

async function removeFile() {
  const f = confirm.file
  if (!f) return
  busyId.value = f.id
  try {
    await useApiFetch(`/api/tools/pim/products/${props.productId}/files/${f.id}`, { method: 'DELETE' })
    confirm.open = false
    emit('changed')
  } catch (err) {
    toast.add({ title: 'Couldn\'t remove the file', description: errorText(err), color: 'error' })
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        Images and documents
      </h2>
    </template>

    <div class="space-y-6">
      <!-- Images -->
      <section class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="flex-1 text-sm font-medium">
            Images
          </h3>
          <template v-if="canEdit">
            <input
              ref="imagePicker"
              type="file"
              multiple
              class="hidden"
              :accept="IMAGE_ACCEPT"
              data-testid="image-input"
              @change="onPick($event, 'image')"
            >
            <UButton
              size="sm"
              variant="outline"
              color="neutral"
              icon="i-lucide-image-plus"
              label="Add images"
              :loading="uploading === 'image'"
              data-testid="add-images"
              @click="imagePicker?.click()"
            />
          </template>
        </div>

        <p
          v-if="!images.length"
          class="text-sm text-muted"
        >
          No images yet. The first image added becomes the main one shown in the list.
        </p>
        <ul
          v-else
          class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          data-testid="pim-images"
        >
          <li
            v-for="f in images"
            :key="f.id"
            class="space-y-1"
            :data-testid="`image-${f.id}`"
          >
            <a
              :href="f.url"
              target="_blank"
              rel="noopener"
              class="relative flex aspect-square items-center justify-center overflow-hidden rounded-md border border-default bg-elevated"
              :title="f.fileName"
            >
              <UIcon
                v-if="broken.has(f.id)"
                name="i-lucide-image"
                class="size-8 text-muted"
              />
              <img
                v-else
                :src="f.url"
                :alt="f.fileName"
                class="size-full object-cover"
                loading="lazy"
                @error="broken.add(f.id)"
              >
              <UBadge
                v-if="f.isMain"
                class="absolute left-1 top-1"
                color="primary"
                label="Main"
              />
            </a>
            <p class="truncate text-xs text-muted">
              {{ f.fileName }}
            </p>
            <div
              v-if="canEdit"
              class="flex flex-wrap gap-1"
            >
              <UButton
                v-if="!f.isMain"
                size="xs"
                variant="outline"
                color="neutral"
                label="Make main"
                :loading="busyId === f.id"
                @click="makeMain(f)"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                aria-label="Remove image"
                @click="Object.assign(confirm, { open: true, file: f })"
              />
            </div>
          </li>
        </ul>
      </section>

      <!-- Documents -->
      <section class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="flex-1 text-sm font-medium">
            Documents
          </h3>
          <template v-if="canEdit">
            <input
              ref="docPicker"
              type="file"
              multiple
              class="hidden"
              :accept="DOC_ACCEPT"
              data-testid="document-input"
              @change="onPick($event, 'document')"
            >
            <UButton
              size="sm"
              variant="outline"
              color="neutral"
              icon="i-lucide-paperclip"
              label="Add documents"
              :loading="uploading === 'document'"
              data-testid="add-documents"
              @click="docPicker?.click()"
            />
          </template>
        </div>

        <p
          v-if="!documents.length"
          class="text-sm text-muted"
        >
          No documents yet. Spec sheets, certificates and manuals go here.
        </p>
        <ul
          v-else
          class="divide-y divide-default rounded-md border border-default"
          data-testid="pim-documents"
        >
          <li
            v-for="f in documents"
            :key="f.id"
            class="flex flex-wrap items-center gap-2 px-3 py-2"
            :data-testid="`document-${f.id}`"
          >
            <a
              :href="f.url"
              target="_blank"
              rel="noopener"
              class="min-w-0 flex-1"
            >
              <span class="block break-words font-medium text-highlighted hover:underline">{{ f.fileName }}</span>
              <span class="text-xs text-muted">{{ formatBytes(f.sizeBytes) }} · added {{ formatDateTimeMY(new Date(f.createdAt)) }}</span>
            </a>
            <UButton
              v-if="canEdit"
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              aria-label="Remove document"
              @click="Object.assign(confirm, { open: true, file: f })"
            />
          </li>
        </ul>
      </section>

      <p
        v-if="canEdit"
        class="text-xs text-muted"
      >
        Images: JPEG, PNG, HEIC, WebP or GIF. Documents: PDF, Word, Excel, PowerPoint, CSV, text and ZIP. Up to
        {{ PROJECT_FILE_MAX_BYTES / 1024 / 1024 }} MB each. Links to files expire after 15 minutes - reload the page for fresh ones.
      </p>
    </div>

    <UModal
      v-model:open="confirm.open"
      :title="`Remove ${confirm.file?.fileName ?? 'file'}?`"
    >
      <template #body>
        <p class="text-sm">
          The file is deleted from this product and from storage. This can't be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Keep it"
            color="neutral"
            variant="outline"
            :disabled="busyId !== null"
            @click="confirm.open = false"
          />
          <UButton
            label="Remove"
            color="error"
            icon="i-lucide-trash-2"
            :loading="busyId !== null"
            @click="removeFile"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
