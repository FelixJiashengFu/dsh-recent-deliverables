import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { normalizeOrganizer, directoryPath, createOrganizerStore } from '../organizer.js'

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'rd-organizer-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  return { base, file: join(base, 'settings', 'organizer.json') }
}

test('organizer normalizes rules, labels and scope without letting All disappear', () => {
  const result = normalizeOrganizer({ categories: { custom: [{ id: 'custom-research', name: '  Research ', extensions: ['.PDF', 'pdf'], contains: ' Final ' }], names: [{ id: '__proto__', label: 'x' }, { id: 'pdf', label: ' Papers ' }], hidden: ['all', 'pdf', 'unknown'], order: ['pdf', 'pdf', 'all'] }, directories: { extra: [homedir(), homedir() + '/'], names: [{ path: homedir(), label: ' Home ' }] } })
  assert.deepEqual(result.categories.custom, [{ id: 'custom-research', name: 'Research', extensions: ['pdf'], contains: 'Final' }])
  assert.deepEqual(result.categories.names, [{ id: 'pdf', label: 'Papers' }])
  assert.deepEqual(result.categories.hidden, ['pdf'])
  assert.deepEqual(result.categories.order, ['pdf', 'all'])
  assert.deepEqual(result.directories.extra, [homedir()])
  assert.equal(directoryPath('~/test/../Projects/'), resolve(homedir(), 'Projects'))
  for (const value of ['relative', '../outside', '', 'a\u0000b']) assert.throws(() => directoryPath(value), { code: 'invalid-directory' })
  assert.throws(() => normalizeOrganizer({ categories: { custom: [{ id: 'custom-empty', name: 'Empty', extensions: [] }] } }), { code: 'empty-category-rule' })
  assert.throws(() => normalizeOrganizer({ categories: { custom: [{ id: 'custom-invalid', name: 'x', extensions: ['../pdf'] }] } }), { code: 'invalid-extension' })
})

test('settings persist atomically, restore on reload, and serialize conflicting writers', async (t) => {
  const { base, file } = await fixture(t)
  const extra = join(base, 'extra'); await mkdir(extra)
  const store = createOrganizerStore(file); await store.ready
  const original = store.snapshot()
  const preferences = normalizeOrganizer({ directories: { extra: [extra] } })
  const results = await Promise.allSettled([store.save(preferences, original.revision), store.save({}, original.revision)])
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].reason.code, 'organizer-conflict')
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).preferences, preferences)
  const reloaded = createOrganizerStore(file); await reloaded.ready
  assert.deepEqual(reloaded.snapshot(), store.snapshot())
  assert.equal((await readFile(file, 'utf8')).includes('"version":1'), true)
})

test('invalid directories and write failures preserve the previous preferences', async (t) => {
  const { base, file } = await fixture(t)
  const store = createOrganizerStore(file); await store.ready
  const before = store.snapshot()
  await assert.rejects(store.save({ directories: { extra: [join(base, 'missing')] } }, before.revision), { code: 'directory-unavailable', status: 400 })
  assert.deepEqual(store.snapshot(), before)
  await writeFile(join(base, 'not-a-directory'), 'original')
  const failed = createOrganizerStore(join(base, 'not-a-directory', 'settings.json')); await failed.ready
  await assert.rejects(failed.save({}, failed.snapshot().revision), { status: 503 })
  assert.equal(await readFile(join(base, 'not-a-directory'), 'utf8'), 'original')
})

test('unreadable or corrupt settings are never overwritten with defaults', async (t) => {
  const { base } = await fixture(t)
  const file = join(base, 'corrupt.json'); await writeFile(file, '{broken')
  const store = createOrganizerStore(file); await store.ready
  assert.equal(store.snapshot().error, 'organizer-unavailable')
  await assert.rejects(store.save({}, store.snapshot().revision), { code: 'organizer-unavailable' })
  assert.equal(await readFile(file, 'utf8'), '{broken')
})
