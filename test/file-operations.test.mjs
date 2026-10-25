import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, readFile, rm, lstat, access, symlink, readlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validFileName, entryKey, prepareRename, loadAliases, saveAliases, followAlias } from '../file-operations.js'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rd-rename-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'old.txt'), target = join(root, 'new.txt')
  await writeFile(source, 'keep me')
  return { root, source, target, key: entryKey(await lstat(source)) }
}

test('filenames are portable to Windows and macOS, including Unicode', () => {
  for (const name of ['新报告.pdf', 'Notes (final).md', 'café.txt', '无扩展名']) assert.equal(validFileName(name), true)
  for (const name of ['..', '.', '', 'a/b', 'a\\b', 'COM1.txt', 'LPT9', 'nul', 'x:', 'a\0b', 'x.', 'x ', 'a'.repeat(256)]) assert.equal(validFileName(name), false, name)
})

test('exclusive rename can be rolled back and never replaces an occupied name', async (t) => {
  const f = await fixture(t)
  const prepared = await prepareRename(f.source, f.target, f.key)
  assert.equal(await readFile(f.target, 'utf8'), 'keep me')
  await prepared.rollback()
  await assert.rejects(access(f.target))
  assert.equal(await readFile(f.source, 'utf8'), 'keep me')
  await writeFile(f.target, 'precious')
  await assert.rejects(prepareRename(f.source, f.target, entryKey(await lstat(f.source))), { code: 'EEXIST' })
  assert.equal(await readFile(f.target, 'utf8'), 'precious')
})

test('a content change during rename prevents commit and leaves the original', async (t) => {
  const f = await fixture(t)
  const prepared = await prepareRename(f.source, f.target, f.key)
  await writeFile(f.source, 'updated content')
  await assert.rejects(prepared.commit(), { code: 'FILE_CHANGED' })
  await prepared.rollback()
  assert.equal(await readFile(f.source, 'utf8'), 'updated content')
})

test('alias history saves atomically and follows chains with a cycle guard', async (t) => {
  const f = await fixture(t), file = join(f.root, 'metadata', 'renames.json')
  const aliases = new Map([[f.source, f.target], [f.target, join(f.root, 'third.txt')]])
  await saveAliases(file, aliases)
  assert.deepEqual(await loadAliases(file), aliases)
  assert.equal(followAlias(aliases, f.source), join(f.root, 'third.txt'))
  aliases.set(join(f.root, 'third.txt'), f.source)
  assert.equal(followAlias(aliases, f.source), f.source)
  assert.deepEqual(await loadAliases(join(f.root, 'absent')), new Map())
  assert.deepEqual(await loadAliases(null), new Map())
})
