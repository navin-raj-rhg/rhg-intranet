import { pimFileProblem, type PimFileKind } from '~~/shared/utils/pimRules'

interface UploadSlot {
  uploadUrl: string
  key: string
  contentType: string
}

/**
 * Adds an image or document to a product in three steps (Step 17.8): ask the
 * server for an upload link (it checks the kind of file, the size and the
 * person's role), send the file straight to R2, then tell the server so it can
 * confirm the file arrived and record it. Throws an Error with a plain message
 * on any failure.
 */
export function usePimFiles() {
  async function uploadPimFile(productId: number, file: File, kind: PimFileKind): Promise<void> {
    const base = `/api/tools/pim/products/${productId}/files`

    const problem = pimFileProblem(file.name, file.size, kind)
    if (problem) throw new Error(`${file.name}: ${problem}`)

    const slot = await useApiFetch<UploadSlot>(`${base}/upload-url`, {
      method: 'POST',
      body: { fileName: file.name, sizeBytes: file.size, kind }
    })

    let put: Response
    try {
      put = await fetch(slot.uploadUrl, { method: 'PUT', headers: { 'Content-Type': slot.contentType }, body: file })
    } catch {
      throw new Error(`${file.name}: the upload didn't go through. Check your connection and try again.`)
    }
    if (!put.ok) throw new Error(`${file.name}: the upload failed (${put.status}). Please try again.`)

    await useApiFetch(base, { method: 'POST', body: { key: slot.key, fileName: file.name, kind } })
  }

  return { uploadPimFile }
}
