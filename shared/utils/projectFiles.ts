/**
 * Rules for files attached to project tasks (Step 16.8): which kinds are
 * allowed and how big they may be. Pure logic, shared by the server (which
 * enforces it) and the screen (which tells the person before uploading).
 *
 * Allowed by file extension, because phones and browsers often send no type or
 * a wrong one. Programs and scripts (.exe, .bat, .js, ...) are never allowed.
 */

export const PROJECT_FILE_MAX_BYTES = 20 * 1024 * 1024

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  zip: 'application/zip'
}

export const PROJECT_FILE_EXTENSIONS = Object.keys(EXTENSION_TYPES)

function extensionOf(fileName: string): string {
  return fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''
}

/**
 * The type a file is stored with: always worked out from its extension, never
 * taken from what the browser claimed (so a script can't be passed off as an image).
 * Empty if the extension isn't allowed.
 */
export function projectFileContentType(fileName: string): string {
  return EXTENSION_TYPES[extensionOf(fileName)] ?? ''
}

/** Plain-English problem with a file, or '' if it is fine. */
export function projectFileProblem(fileName: string, sizeBytes: number): string {
  if (!projectFileContentType(fileName)) {
    return 'That kind of file can\'t be attached. Allowed: images, PDF, Word, Excel, PowerPoint, CSV, text and ZIP files'
  }
  if (sizeBytes <= 0) return 'That file is empty'
  if (sizeBytes > PROJECT_FILE_MAX_BYTES) return `Files must be ${PROJECT_FILE_MAX_BYTES / 1024 / 1024} MB or smaller`
  return ''
}

/** Keeps a file name short and free of path pieces before it is stored for display. */
export function tidyProjectFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? ''
  return base.replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** Who may remove a file: whoever attached it, the project owner or an admin. */
export function canRemoveProjectFile(args: { userId: string, uploadedBy: string, canManage: boolean }): boolean {
  return args.canManage || args.userId === args.uploadedBy
}
