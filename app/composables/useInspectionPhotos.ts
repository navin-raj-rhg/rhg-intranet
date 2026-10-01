interface UploadSlot {
  uploadUrl: string
  key: string
  contentType: string
}

interface SavedPhoto {
  id: number
  fileName: string
  sizeBytes: number
}

/**
 * Adds a photo to an inspection point in three steps (Step 12.8): ask the
 * server for an upload link (it checks type, size and that the report is an
 * editable draft), send the file straight to R2, then tell the server so it
 * can confirm the file arrived and record it. Throws an Error with a plain
 * message on any failure.
 */
export function useInspectionPhotos() {
  async function uploadPhoto(reportId: number, pointId: number, file: File): Promise<SavedPhoto> {
    const base = `/api/tools/inspection-reporting/reports/${reportId}/points/${pointId}/photos`

    const problem = inspectionPhotoProblem(file.name, inspectionPhotoContentType(file.name, file.type), file.size)
    if (problem) throw new Error(`${file.name}: ${problem}`)

    const slot = await useApiFetch<UploadSlot>(`${base}/upload-url`, {
      method: 'POST',
      body: { fileName: file.name, contentType: file.type, sizeBytes: file.size }
    })

    let put: Response
    try {
      put = await fetch(slot.uploadUrl, { method: 'PUT', headers: { 'Content-Type': slot.contentType }, body: file })
    } catch {
      throw new Error(`${file.name}: the upload didn't go through. Check your connection and try again.`)
    }
    if (!put.ok) throw new Error(`${file.name}: the upload failed (${put.status}). Please try again.`)

    return useApiFetch<SavedPhoto>(base, {
      method: 'POST',
      body: { key: slot.key, fileName: file.name, contentType: slot.contentType }
    })
  }

  return { uploadPhoto }
}
