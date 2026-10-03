/**
 * Rules for dashboard Posts (Step 18): text limits, images, the fixed set of
 * emoji reactions, who may edit or delete, and counting reactions for display.
 * Pure logic, shared by the server (which enforces it) and the widget.
 */

export const POST_MAX_CHARS = 5000
export const COMMENT_MAX_CHARS = 2000
export const POST_MAX_IMAGES = 4
export const POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024

/** The only reactions on offer: easy to count, no picker needed. */
export const POST_REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'] as const

export function isPostReactionEmoji(value: string): boolean {
  return (POST_REACTION_EMOJIS as readonly string[]).includes(value)
}

const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png'
}

function extensionOf(fileName: string): string {
  return fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''
}

/** Stored type, worked out from the extension (never from what the browser claimed); '' if not allowed. */
export function postImageContentType(fileName: string): string {
  return IMAGE_TYPES[extensionOf(fileName)] ?? ''
}

/** Plain-English problem with an image, or '' if it is fine. */
export function postImageProblem(fileName: string, sizeBytes: number): string {
  if (!postImageContentType(fileName)) return 'Only JPEG and PNG images can be added to a post'
  if (sizeBytes <= 0) return 'That image is empty'
  if (sizeBytes > POST_IMAGE_MAX_BYTES) return 'Each image must be 10 MB or smaller'
  return ''
}

/** Text as it is stored: line endings tidied, surrounding space removed. */
export function cleanPostText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim()
}

/** Plain-English problem with a post or comment's text, or '' if it is fine. */
export function postTextProblem(text: string, max: number, allowEmpty = false): string {
  const clean = cleanPostText(text)
  if (!clean && !allowEmpty) return 'Write something first'
  if (clean.length > max) return `Keep it under ${max} characters (it is ${clean.length})`
  return ''
}

/** Authors edit their own posts and comments. Nobody else, the owner included. */
export function canEditPostItem(authorId: string, userId: string): boolean {
  return authorId === userId
}

/** Authors delete their own; the owner deletes anyone's. */
export function canDeletePostItem(authorId: string, userId: string, isOwner: boolean): boolean {
  return isOwner || authorId === userId
}

export interface ReactionSummary {
  emoji: string
  count: number
  mine: boolean
}

/** Counts reactions per emoji in the fixed order, leaving out emojis nobody used. */
export function summariseReactions(rows: { emoji: string, userId: string }[], userId: string): ReactionSummary[] {
  const out: ReactionSummary[] = []
  for (const emoji of POST_REACTION_EMOJIS) {
    const used = rows.filter(r => r.emoji === emoji)
    if (used.length) out.push({ emoji, count: used.length, mine: used.some(r => r.userId === userId) })
  }
  return out
}

/** What the dashboard API sends for one comment. */
export interface PostComment {
  id: number
  authorId: string
  authorName: string
  body: string
  edited: boolean
  createdAt: string
  reactions: ReactionSummary[]
  canEdit: boolean
  canDelete: boolean
}

/** What the dashboard API sends for one post. */
export interface PostView {
  id: number
  authorId: string
  authorName: string
  body: string
  pinned: boolean
  edited: boolean
  createdAt: string
  images: { id: number, fileName: string, url: string }[]
  reactions: ReactionSummary[]
  commentCount: number
  canEdit: boolean
  canDelete: boolean
}
