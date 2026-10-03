import { postImageProblem } from '~~/shared/utils/postRules'

interface UploadSlot {
  uploadUrl: string
  key: string
  contentType: string
}

/**
 * Sends one post image to R2 in two steps (the third, recording it, happens when
 * the post is created): ask the server for an upload link (it checks the type and
 * size), then send the file straight to R2. Throws an Error with a plain message.
 */
export function usePostImages() {
  async function uploadImage(file: File): Promise<{ key: string, fileName: string }> {
    const problem = postImageProblem(file.name, file.size)
    if (problem) throw new Error(`${file.name}: ${problem}`)

    const slot = await useApiFetch<UploadSlot>('/api/dashboard/posts/image-upload-url', {
      method: 'POST',
      body: { fileName: file.name, sizeBytes: file.size }
    })

    let put: Response
    try {
      put = await fetch(slot.uploadUrl, { method: 'PUT', headers: { 'Content-Type': slot.contentType }, body: file })
    } catch {
      throw new Error(`${file.name}: the upload didn't go through. Check your connection and try again.`)
    }
    if (!put.ok) throw new Error(`${file.name}: the upload failed (${put.status}). Please try again.`)
    return { key: slot.key, fileName: file.name }
  }

  return { uploadImage }
}
