import test from 'node:test'
import assert from 'node:assert/strict'
import {
  POST_MAX_CHARS, POST_IMAGE_MAX_BYTES, isPostReactionEmoji, postImageContentType, postImageProblem,
  cleanPostText, postTextProblem, canEditPostItem, canDeletePostItem, summariseReactions
} from '../shared/utils/postRules.ts'

test('only the six fixed emojis are reactions', () => {
  assert.equal(isPostReactionEmoji('👍'), true)
  assert.equal(isPostReactionEmoji('🙏'), true)
  assert.equal(isPostReactionEmoji('💩'), false)
  assert.equal(isPostReactionEmoji(''), false)
})

test('images: JPEG and PNG only, by extension, up to 10 MB', () => {
  assert.equal(postImageContentType('Photo.JPG'), 'image/jpeg')
  assert.equal(postImageContentType('a.png'), 'image/png')
  assert.equal(postImageContentType('a.heic'), '')
  assert.equal(postImageContentType('virus.png.exe'), '')
  assert.equal(postImageProblem('a.jpg', 1000), '')
  assert.equal(postImageProblem('a.jpg', POST_IMAGE_MAX_BYTES), '')
  assert.ok(postImageProblem('a.jpg', POST_IMAGE_MAX_BYTES + 1))
  assert.ok(postImageProblem('a.jpg', 0))
  assert.ok(postImageProblem('a.gif', 100))
})

test('text is tidied and limited', () => {
  assert.equal(cleanPostText('  hi\r\nthere \r\n'), 'hi\nthere')
  assert.ok(postTextProblem('   ', POST_MAX_CHARS))
  assert.equal(postTextProblem('   ', POST_MAX_CHARS, true), '')
  assert.equal(postTextProblem('ok', POST_MAX_CHARS), '')
  assert.ok(postTextProblem('x'.repeat(POST_MAX_CHARS + 1), POST_MAX_CHARS))
  assert.equal(postTextProblem('x'.repeat(POST_MAX_CHARS), POST_MAX_CHARS), '')
})

test('edit is author only; delete is author or owner', () => {
  assert.equal(canEditPostItem('a', 'a'), true)
  assert.equal(canEditPostItem('a', 'b'), false)
  assert.equal(canDeletePostItem('a', 'a', false), true)
  assert.equal(canDeletePostItem('a', 'b', false), false)
  assert.equal(canDeletePostItem('a', 'b', true), true)
})

test('reactions are counted in the fixed order and flag your own', () => {
  const rows = [
    { emoji: '🎉', userId: 'u1' },
    { emoji: '👍', userId: 'u2' },
    { emoji: '🎉', userId: 'u2' }
  ]
  assert.deepEqual(summariseReactions(rows, 'u1'), [
    { emoji: '👍', count: 1, mine: false },
    { emoji: '🎉', count: 2, mine: true }
  ])
  assert.deepEqual(summariseReactions([], 'u1'), [])
})
