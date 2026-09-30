/**
 * The most useful message from a failed $fetch: the server's own statusMessage
 * (which our routes make plain and readable) rather than the generic
 * "[POST] ... 409" text that Error.message carries.
 */
export function errorText(err: unknown): string {
  const e = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
  return e?.data?.statusMessage || e?.statusMessage || e?.message || 'Something went wrong.'
}
