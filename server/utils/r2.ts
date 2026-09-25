import { randomUUID } from 'node:crypto'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let _r2: S3Client | null = null

/** Lazily-created singleton S3 client pointed at Cloudflare R2. */
export function useR2() {
  if (_r2) return _r2

  const config = useRuntimeConfig()
  if (!config.r2AccountId || !config.r2AccessKeyId || !config.r2SecretAccessKey) {
    throw new Error('R2 credentials are not configured. Check NUXT_R2_* in your .env.')
  }

  _r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey
    },
    // Newer AWS SDK versions attach a checksum header by default, which R2
    // doesn't always handle the same way S3 does - this can cause a
    // SignatureDoesNotMatch error on presigned uploads from the browser.
    // 'WHEN_REQUIRED' keeps checksums off unless something explicitly asks
    // for one, matching R2's expectations.
    requestChecksumCalculation: 'WHEN_REQUIRED'
  })
  return _r2
}

export function r2Bucket() {
  const config = useRuntimeConfig()
  if (!config.r2Bucket) {
    throw new Error('NUXT_R2_BUCKET is not set.')
  }
  return config.r2Bucket
}

/**
 * Builds a namespaced object key so every tool's uploads live under their
 * own prefix within the single shared bucket - e.g.
 * "expense-claims/2026/09/3f9c2b1a-...-receipt.jpg". There are no real
 * "sub-buckets" in R2/S3; this prefix convention is what gives each tool
 * its own clearly separated space, both in the dashboard and for any
 * future per-prefix lifecycle rules.
 */
export function buildObjectKey(toolId: string, originalFilename: string) {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')

  const safeName = originalFilename
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, '-')
    .replace(/-+/g, '-')

  return `${toolId}/${yyyy}/${mm}/${randomUUID()}-${safeName}`
}

/** Presigned URL the browser can PUT the file to directly, bypassing our server. */
export function getUploadUrl(key: string, contentType: string, expiresInSeconds = 300) {
  const command = new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: key,
    ContentType: contentType
  })
  return getSignedUrl(useR2(), command, { expiresIn: expiresInSeconds })
}

/** Presigned URL to view/download a private object, time-limited. */
export function getDownloadUrl(key: string, expiresInSeconds = 300) {
  const command = new GetObjectCommand({
    Bucket: r2Bucket(),
    Key: key
  })
  return getSignedUrl(useR2(), command, { expiresIn: expiresInSeconds })
}
