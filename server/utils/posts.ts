import { and, asc, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { useDb } from '~~/server/db/client'
import { postCommentReactions, postComments, postImages, postReactions, posts, profiles } from '~~/server/db/schema'
import { buildObjectKey, deleteObject, getDownloadUrl, getUploadUrl, headObjectSize } from '~~/server/utils/r2'
import {
  canDeletePostItem,
  canEditPostItem,
  cleanPostText,
  COMMENT_MAX_CHARS,
  isPostReactionEmoji,
  POST_MAX_CHARS,
  POST_MAX_IMAGES,
  postImageContentType,
  postImageProblem,
  postTextProblem,
  summariseReactions,
  type PostComment,
  type PostView
} from '~~/shared/utils/postRules'
import { tidyProjectFileName } from '~~/shared/utils/projectFiles'

type Db = ReturnType<typeof useDb>

/** Posts are not a tool, so their files live in their own R2 folder. */
export const POSTS_STORAGE_FOLDER = 'posts'
export const POSTS_PAGE_SIZE = 10
const IMAGE_LINK_SECONDS = 900

export class PostError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Turn a PostError into an HTTP error; anything else is rethrown. */
export function postHttpError(err: unknown): never {
  if (err instanceof PostError) throw createError({ statusCode: err.status, statusMessage: err.message })
  throw err
}

export function parsePostParam(event: H3Event, param = 'id', what = 'post'): number {
  const id = Number(getRouterParam(event, param))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: `Invalid ${what}.` })
  return id
}

export function postBodyProblem(parsed: { success: boolean, error?: { issues: { message: string }[] } }): string {
  return parsed.success ? '' : (parsed.error?.issues[0]?.message ?? 'That request was not valid.')
}

export const postCreateBodySchema = z.object({
  body: z.string({ message: 'Write something first' }),
  images: z.array(z.object({
    key: z.string().min(1).max(500),
    fileName: z.string().min(1).max(255)
  })).max(POST_MAX_IMAGES, `A post can have up to ${POST_MAX_IMAGES} images.`).default([])
})

export const postTextBodySchema = z.object({ body: z.string({ message: 'Write something first' }) })
export const postPinBodySchema = z.object({ pinned: z.boolean() })
export const postReactBodySchema = z.object({ emoji: z.string({ message: 'Pick a reaction' }) })
export const postImageUploadBodySchema = z.object({
  fileName: z.string({ message: 'Choose an image' }).min(1, 'Choose an image').max(255),
  sizeBytes: z.number({ message: 'Choose an image' }).int()
})

const personName = (fullName: string | null, email: string) => fullName?.trim() || email

function loadReactions(rows: { key: number, emoji: string, userId: string }[]) {
  const byKey = new Map<number, { emoji: string, userId: string }[]>()
  for (const r of rows) {
    const list = byKey.get(r.key) ?? []
    list.push({ emoji: r.emoji, userId: r.userId })
    byKey.set(r.key, list)
  }
  return byKey
}

/** One page of posts: the pinned post first (first page only), then newest first. */
export async function listPosts(db: Db, user: { id: string, isOwner: boolean }, before: number | null) {
  const columns = {
    id: posts.id,
    authorId: posts.authorId,
    body: posts.body,
    pinnedAt: posts.pinnedAt,
    editedAt: posts.editedAt,
    createdAt: posts.createdAt,
    fullName: profiles.fullName,
    email: profiles.email
  }
  const base = () => db.select(columns).from(posts).innerJoin(profiles, eq(profiles.id, posts.authorId))

  const rows = await base()
    .where(before ? and(lt(posts.id, before), sql`${posts.pinnedAt} is null`) : sql`${posts.pinnedAt} is null`)
    .orderBy(desc(posts.id))
    .limit(POSTS_PAGE_SIZE + 1)
  const hasMore = rows.length > POSTS_PAGE_SIZE
  const page = rows.slice(0, POSTS_PAGE_SIZE)
  if (!before) {
    const pinned = await base().where(isNotNull(posts.pinnedAt)).limit(1)
    page.unshift(...pinned)
  }
  const ids = page.map(p => p.id)
  if (!ids.length) return { posts: [] as PostView[], hasMore: false }

  const [images, reactions, counts] = await Promise.all([
    db.select().from(postImages).where(inArray(postImages.postId, ids)).orderBy(asc(postImages.id)),
    db.select({ key: postReactions.postId, emoji: postReactions.emoji, userId: postReactions.userId })
      .from(postReactions).where(inArray(postReactions.postId, ids)),
    db.select({ postId: postComments.postId, n: sql<number>`count(*)::int` })
      .from(postComments).where(inArray(postComments.postId, ids)).groupBy(postComments.postId)
  ])
  const urls = await Promise.all(images.map(i => getDownloadUrl(i.fileKey, IMAGE_LINK_SECONDS)))
  const reactionMap = loadReactions(reactions)

  const views: PostView[] = page.map(p => ({
    id: p.id,
    authorId: p.authorId,
    authorName: personName(p.fullName, p.email),
    body: p.body,
    pinned: !!p.pinnedAt,
    edited: !!p.editedAt,
    createdAt: p.createdAt.toISOString(),
    images: images.flatMap((img, i) => img.postId === p.id ? [{ id: img.id, fileName: img.fileName, url: urls[i]! }] : []),
    reactions: summariseReactions(reactionMap.get(p.id) ?? [], user.id),
    commentCount: counts.find(c => c.postId === p.id)?.n ?? 0,
    canEdit: canEditPostItem(p.authorId, user.id),
    canDelete: canDeletePostItem(p.authorId, user.id, user.isOwner)
  }))
  return { posts: views, hasMore }
}

/** Step 1 of adding an image: check it, then hand back a short-lived upload link locked to its size. */
export async function createPostImageUpload(file: { fileName: string, sizeBytes: number }) {
  const fileName = tidyProjectFileName(file.fileName)
  const problem = postImageProblem(fileName, file.sizeBytes)
  if (problem) throw new PostError(400, problem)
  const contentType = postImageContentType(fileName)
  const key = buildObjectKey(POSTS_STORAGE_FOLDER, fileName)
  const uploadUrl = await getUploadUrl(key, contentType, 300, file.sizeBytes)
  return { uploadUrl, key, contentType }
}

/** Step 3: create the post, after confirming each image really arrived at an allowed size. */
export async function createPost(db: Db, authorId: string, input: { body: string, images: { key: string, fileName: string }[] }) {
  const problem = postTextProblem(input.body, POST_MAX_CHARS, input.images.length > 0)
  if (problem) throw new PostError(400, problem)

  const checked: { key: string, fileName: string, contentType: string, sizeBytes: number }[] = []
  for (const img of input.images) {
    if (!img.key.startsWith(`${POSTS_STORAGE_FOLDER}/`) || img.key.includes('..')) {
      throw new PostError(400, 'That is not a post image.')
    }
    if (checked.some(c => c.key === img.key)) throw new PostError(400, 'The same image was added twice.')
    const size = await headObjectSize(img.key)
    if (size === null) throw new PostError(400, 'An image did not finish uploading. Please try again.')
    const fileName = tidyProjectFileName(img.fileName)
    const imageProblem = postImageProblem(fileName, size)
    if (imageProblem) {
      await deleteObject(img.key).catch(() => {})
      throw new PostError(400, imageProblem)
    }
    const [taken] = await db.select({ id: postImages.id }).from(postImages).where(eq(postImages.fileKey, img.key))
    if (taken) throw new PostError(409, 'That image is already on a post.')
    checked.push({ key: img.key, fileName, contentType: postImageContentType(fileName), sizeBytes: size })
  }

  return await db.transaction(async (tx) => {
    const [post] = await tx.insert(posts).values({ authorId, body: cleanPostText(input.body) }).returning({ id: posts.id })
    if (checked.length) {
      await tx.insert(postImages).values(checked.map(c => ({
        postId: post!.id, fileKey: c.key, fileName: c.fileName, contentType: c.contentType, sizeBytes: c.sizeBytes
      })))
    }
    return post!
  })
}

async function loadPost(db: Db, postId: number) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId))
  if (!post) throw new PostError(404, 'That post no longer exists.')
  return post
}

export async function editPost(db: Db, userId: string, postId: number, body: string) {
  const post = await loadPost(db, postId)
  if (!canEditPostItem(post.authorId, userId)) throw new PostError(403, 'You can only edit your own posts.')
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(postImages).where(eq(postImages.postId, postId))
  const problem = postTextProblem(body, POST_MAX_CHARS, n > 0)
  if (problem) throw new PostError(400, problem)
  await db.update(posts).set({ body: cleanPostText(body), editedAt: new Date() }).where(eq(posts.id, postId))
}

export async function deletePost(db: Db, user: { id: string, isOwner: boolean }, postId: number) {
  const post = await loadPost(db, postId)
  if (!canDeletePostItem(post.authorId, user.id, user.isOwner)) throw new PostError(403, 'You can only delete your own posts.')
  const images = await db.select({ key: postImages.fileKey }).from(postImages).where(eq(postImages.postId, postId))
  await db.delete(posts).where(eq(posts.id, postId))
  await Promise.all(images.map(i => deleteObject(i.key).catch(() => {})))
}

/** Owner only (checked by the route). Pinning one post unpins any other. */
export async function setPostPinned(db: Db, postId: number, pinned: boolean) {
  await loadPost(db, postId)
  await db.transaction(async (tx) => {
    if (pinned) await tx.update(posts).set({ pinnedAt: null }).where(isNotNull(posts.pinnedAt))
    await tx.update(posts).set({ pinnedAt: pinned ? new Date() : null }).where(eq(posts.id, postId))
  })
}

function failIfBadEmoji(emoji: string) {
  if (!isPostReactionEmoji(emoji)) throw new PostError(400, 'That reaction is not available.')
}

/** Adds the reaction, or removes it if the person already gave it. Returns the new summary. */
export async function togglePostReaction(db: Db, userId: string, postId: number, emoji: string) {
  failIfBadEmoji(emoji)
  await loadPost(db, postId)
  const removed = await db
    .delete(postReactions)
    .where(and(eq(postReactions.postId, postId), eq(postReactions.userId, userId), eq(postReactions.emoji, emoji)))
    .returning({ e: postReactions.emoji })
  if (!removed.length) await db.insert(postReactions).values({ postId, userId, emoji }).onConflictDoNothing()
  const rows = await db.select({ emoji: postReactions.emoji, userId: postReactions.userId }).from(postReactions).where(eq(postReactions.postId, postId))
  return summariseReactions(rows, userId)
}

export async function listComments(db: Db, user: { id: string, isOwner: boolean }, postId: number): Promise<PostComment[]> {
  await loadPost(db, postId)
  const rows = await db
    .select({
      id: postComments.id,
      authorId: postComments.authorId,
      body: postComments.body,
      editedAt: postComments.editedAt,
      createdAt: postComments.createdAt,
      fullName: profiles.fullName,
      email: profiles.email
    })
    .from(postComments)
    .innerJoin(profiles, eq(profiles.id, postComments.authorId))
    .where(eq(postComments.postId, postId))
    .orderBy(asc(postComments.id))
  const ids = rows.map(r => r.id)
  const reactions = ids.length
    ? await db.select({ key: postCommentReactions.commentId, emoji: postCommentReactions.emoji, userId: postCommentReactions.userId })
        .from(postCommentReactions).where(inArray(postCommentReactions.commentId, ids))
    : []
  const reactionMap = loadReactions(reactions)
  return rows.map(r => ({
    id: r.id,
    authorId: r.authorId,
    authorName: personName(r.fullName, r.email),
    body: r.body,
    edited: !!r.editedAt,
    createdAt: r.createdAt.toISOString(),
    reactions: summariseReactions(reactionMap.get(r.id) ?? [], user.id),
    canEdit: canEditPostItem(r.authorId, user.id),
    canDelete: canDeletePostItem(r.authorId, user.id, user.isOwner)
  }))
}

export async function addComment(db: Db, authorId: string, postId: number, body: string) {
  const problem = postTextProblem(body, COMMENT_MAX_CHARS)
  if (problem) throw new PostError(400, problem)
  await loadPost(db, postId)
  const [row] = await db.insert(postComments).values({ postId, authorId, body: cleanPostText(body) }).returning({ id: postComments.id })
  return row!
}

async function loadComment(db: Db, commentId: number) {
  const [comment] = await db.select().from(postComments).where(eq(postComments.id, commentId))
  if (!comment) throw new PostError(404, 'That comment no longer exists.')
  return comment
}

export async function editComment(db: Db, userId: string, commentId: number, body: string) {
  const comment = await loadComment(db, commentId)
  if (!canEditPostItem(comment.authorId, userId)) throw new PostError(403, 'You can only edit your own comments.')
  const problem = postTextProblem(body, COMMENT_MAX_CHARS)
  if (problem) throw new PostError(400, problem)
  await db.update(postComments).set({ body: cleanPostText(body), editedAt: new Date() }).where(eq(postComments.id, commentId))
}

export async function deleteComment(db: Db, user: { id: string, isOwner: boolean }, commentId: number) {
  const comment = await loadComment(db, commentId)
  if (!canDeletePostItem(comment.authorId, user.id, user.isOwner)) throw new PostError(403, 'You can only delete your own comments.')
  await db.delete(postComments).where(eq(postComments.id, commentId))
}

export async function toggleCommentReaction(db: Db, userId: string, commentId: number, emoji: string) {
  failIfBadEmoji(emoji)
  await loadComment(db, commentId)
  const removed = await db
    .delete(postCommentReactions)
    .where(and(eq(postCommentReactions.commentId, commentId), eq(postCommentReactions.userId, userId), eq(postCommentReactions.emoji, emoji)))
    .returning({ e: postCommentReactions.emoji })
  if (!removed.length) await db.insert(postCommentReactions).values({ commentId, userId, emoji }).onConflictDoNothing()
  const rows = await db
    .select({ emoji: postCommentReactions.emoji, userId: postCommentReactions.userId })
    .from(postCommentReactions)
    .where(eq(postCommentReactions.commentId, commentId))
  return summariseReactions(rows, userId)
}
