import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROJECT_FILE_MAX_BYTES,
  canRemoveProjectFile,
  projectFileContentType,
  projectFileProblem,
  tidyProjectFileName
} from '../shared/utils/projectFiles.ts'

test('allowed files get a type from their extension, whatever the browser said', () => {
  assert.equal(projectFileContentType('Photo.JPG'), 'image/jpeg')
  assert.equal(projectFileContentType('spec sheet.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.equal(projectFileContentType('notes.txt'), 'text/plain')
})

test('programs, scripts and unknown files are refused', () => {
  for (const name of ['setup.exe', 'run.bat', 'x.js', 'page.html', 'noextension', 'archive.tar.gz.exe']) {
    assert.equal(projectFileContentType(name), '', name)
    assert.match(projectFileProblem(name, 100), /can't be attached/)
  }
})

test('size limits', () => {
  assert.equal(projectFileProblem('a.pdf', 1), '')
  assert.equal(projectFileProblem('a.pdf', PROJECT_FILE_MAX_BYTES), '')
  assert.match(projectFileProblem('a.pdf', PROJECT_FILE_MAX_BYTES + 1), /20 MB/)
  assert.match(projectFileProblem('a.pdf', 0), /empty/)
})

test('file names are shortened and stripped of folders', () => {
  assert.equal(tidyProjectFileName('C:\\Users\\me\\  my   file.pdf '), 'my file.pdf')
  assert.equal(tidyProjectFileName('../../etc/passwd.txt'), 'passwd.txt')
  assert.equal(tidyProjectFileName('x'.repeat(300) + '.pdf').length, 200)
})

test('who can remove a file', () => {
  const base = { userId: 'u1', uploadedBy: 'u2', canManage: false }
  assert.equal(canRemoveProjectFile(base), false)
  assert.equal(canRemoveProjectFile({ ...base, userId: 'u2' }), true)
  assert.equal(canRemoveProjectFile({ ...base, canManage: true }), true)
})
