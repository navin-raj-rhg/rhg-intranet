/**
 * Pure rules for finding orphaned files in the R2 bucket (Step 13.10): files
 * no database row points to any more (an abandoned upload, a replaced receipt).
 * Only files under a tool's own folder are ever considered, and only once they
 * are old enough that an upload still in progress can't be mistaken for one.
 */

/** The folders tools save under (see buildObjectKey). Anything else in the bucket is left alone. */
export const STORAGE_TOOL_PREFIXES = ['expense-claims/', 'leave-applications/', 'inspection-reporting/', 'projects/', 'pim/']

/** A file must be at least this old before it can be called an orphan. */
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000

export interface StoredObject {
  key: string
  size: number
  /** Milliseconds since 1970. */
  lastModified: number
}

export function isToolStorageKey(key: string): boolean {
  return STORAGE_TOOL_PREFIXES.some(p => key.startsWith(p))
}

/** Is this one file an orphan right now? */
export function isOrphan(obj: StoredObject, referenced: ReadonlySet<string>, now: number, minAgeMs = ORPHAN_MIN_AGE_MS): boolean {
  return isToolStorageKey(obj.key) && !referenced.has(obj.key) && now - obj.lastModified >= minAgeMs
}

/** The orphans among `objects`, oldest first. */
export function findOrphans(objects: StoredObject[], referenced: ReadonlySet<string>, now: number, minAgeMs = ORPHAN_MIN_AGE_MS): StoredObject[] {
  return objects
    .filter(o => isOrphan(o, referenced, now, minAgeMs))
    .sort((a, b) => a.lastModified - b.lastModified)
}

/** "512 B", "3.4 KB", "12.0 MB" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** Which tool a stored file belongs to, for display ("expense-claims/2026/09/x.jpg" -> "expense-claims"). */
export function storageToolOf(key: string): string {
  return key.split('/')[0] ?? ''
}
