import { isNotNull } from 'drizzle-orm'
import type { useDb } from '~~/server/db/client'
import { expenseClaims, expensePayoutBatches, inspectionPhotos, leaveApplications } from '~~/server/db/schema'
import { deleteObject, headObjectLastModified, listObjects } from '~~/server/utils/r2'
import {
  findOrphans,
  isOrphan,
  isToolStorageKey,
  STORAGE_TOOL_PREFIXES,
  type StoredObject
} from '~~/shared/utils/storageCleanup'

type Db = ReturnType<typeof useDb>

/** Every file key some database row points to. */
export async function loadReferencedKeys(db: Db): Promise<Set<string>> {
  const [receipts, reports, attachments, photos] = await Promise.all([
    db.select({ k: expenseClaims.receiptKey }).from(expenseClaims),
    db.select({ k: expensePayoutBatches.pdfKey }).from(expensePayoutBatches).where(isNotNull(expensePayoutBatches.pdfKey)),
    db.select({ k: leaveApplications.attachmentKey }).from(leaveApplications).where(isNotNull(leaveApplications.attachmentKey)),
    db.select({ k: inspectionPhotos.r2Key }).from(inspectionPhotos)
  ])
  return new Set([...receipts, ...reports, ...attachments, ...photos].map(r => r.k).filter((k): k is string => !!k))
}

/**
 * Deletes a file that was just replaced or whose record was just removed - but
 * only if nothing else points to it and it lives in a tool's own folder. (A
 * claim can be saved with any key, so this must never trust the key alone.)
 * Best effort: a failure leaves an orphan the clean-up screen can catch later.
 */
export async function deleteIfUnreferenced(db: Db, key: string | null | undefined): Promise<void> {
  if (!key || !isToolStorageKey(key)) return
  try {
    const stillUsed = (await loadReferencedKeys(db)).has(key)
    if (!stillUsed) await deleteObject(key)
  } catch {
    // ignore - see above
  }
}

/** Every orphaned file in the bucket (old enough, in a tool folder, referenced by nothing). */
export async function listOrphans(db: Db): Promise<StoredObject[]> {
  const referenced = await loadReferencedKeys(db)
  const objects: StoredObject[] = []
  for (const prefix of STORAGE_TOOL_PREFIXES) {
    for await (const o of listObjects(prefix)) objects.push(o)
  }
  return findOrphans(objects, referenced, Date.now())
}

/**
 * Deletes the files the owner confirmed. Each one is re-checked just before it
 * goes (still unreferenced, still old enough, still in a tool folder), so a
 * file that gained a reference since the list was shown is skipped.
 */
export async function deleteOrphans(db: Db, keys: string[]): Promise<{ deleted: number, skipped: number, freedBytes: number }> {
  const referenced = await loadReferencedKeys(db)
  const now = Date.now()
  let deleted = 0
  let skipped = 0
  let freedBytes = 0

  for (const key of [...new Set(keys)]) {
    const info = isToolStorageKey(key) && !referenced.has(key) ? await headObjectLastModified(key) : null
    const obj: StoredObject | null = info ? { key, size: info.size, lastModified: info.lastModified } : null
    if (!obj || !isOrphan(obj, referenced, now)) {
      skipped++
      continue
    }
    await deleteObject(key)
    deleted++
    freedBytes += obj.size
  }
  return { deleted, skipped, freedBytes }
}
