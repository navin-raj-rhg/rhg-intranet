interface UploadUrlResponse {
  uploadUrl: string
  key: string
}

interface DownloadUrlResponse {
  downloadUrl: string
}

export function useFileUpload() {
  /**
   * Uploads a file for the given tool and returns the R2 object key to
   * store alongside your record (e.g. expenseClaims.receiptKey). The file
   * goes straight from the browser to R2 - it never passes through our
   * Nitro server.
   */
  async function uploadFile(toolId: string, file: File): Promise<string> {
    const { uploadUrl, key } = await useApiFetch<UploadUrlResponse>('/api/storage/upload-url', {
      method: 'POST',
      body: {
        toolId,
        filename: file.name,
        contentType: file.type || 'application/octet-stream'
      }
    })

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    })

    if (!response.ok) {
      throw new Error(`Upload failed (${response.status})`)
    }

    return key
  }

  /**
   * Gets a short-lived URL to view/download a private object. See the
   * warning in server/api/storage/download-url.get.ts - prefer a tool's own
   * permission-checked endpoint over this generic one once that exists.
   */
  async function getDownloadUrl(key: string): Promise<string> {
    const { downloadUrl } = await useApiFetch<DownloadUrlResponse>('/api/storage/download-url', {
      query: { key }
    })
    return downloadUrl
  }

  return { uploadFile, getDownloadUrl }
}
