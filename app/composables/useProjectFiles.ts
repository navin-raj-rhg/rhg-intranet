import { projectFileProblem } from '~~/shared/utils/projectFiles'

interface UploadSlot {
  uploadUrl: string
  key: string
  contentType: string
}

/**
 * Attaches a file to a project task in three steps (Step 16.8): ask the server
 * for an upload link (it checks the kind of file, the size and that the person
 * belongs to the project), send the file straight to R2, then tell the server so
 * it can confirm the file arrived and record it. Throws an Error with a plain
 * message on any failure.
 */
export function useProjectFiles() {
  async function uploadFile(projectId: number, taskId: number, file: File): Promise<void> {
    const base = `/api/tools/projects/${projectId}/tasks/${taskId}/files`

    const problem = projectFileProblem(file.name, file.size)
    if (problem) throw new Error(`${file.name}: ${problem}`)

    const slot = await useApiFetch<UploadSlot>(`${base}/upload-url`, {
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

    await useApiFetch(base, { method: 'POST', body: { key: slot.key, fileName: file.name } })
  }

  return { uploadFile }
}
