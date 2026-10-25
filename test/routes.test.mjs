import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, unlink, realpath, rm, rename, access, lstat, readFile, readlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply, createPlugin } from '../index.js'

async function fixture(t, extra = {}, config = {}, trashFile, operations = {}) {
  const base = await mkdtemp(join(tmpdir(), 'recent-deliverables-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const root = join(base, 'workspace')
  await mkdir(root)
  await writeFile(join(root, 'inside.txt'), 'inside')
  await writeFile(join(base, 'outside.txt'), 'outside')
  const routes = new Map()
  const opened = []
  const services = {
    workingDirectory: { defaultDirectory: root },
    sessionController: {
      workspaceDesktop: () => ({ available: true }),
      openWorkspacePath: async (options) => opened.push(options.path),
    },
    ...extra,
  }
  const mount = createPlugin(trashFile, { renameMapFile: join(base, 'rename-history.json'), ...operations })
  mount({
    effect: (fn) => { const dispose = fn(); t.after(dispose) },
    get: (name) => services[name],
    connection: { fetch: { register: (route) => routes.set(route.path, route.fetch) } },
  }, { includePresent: Boolean(extra.sessionQuery), cacheMs: 0, ...config })
  const call = (action, path, body) => routes.get(`/api/recent-deliverables.${action}`)(
    new Request(`http://localhost/api/recent-deliverables.${action}?path=${encodeURIComponent(path ?? '')}`,
      { method: ['open', 'delete', 'delete-batch', 'rename'].includes(action) ? 'POST' : 'GET',
        ...(['delete', 'delete-batch', 'rename'].includes(action) ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? { path }) } : {}) }),
  )
  return { base, root, call, opened, services }
}

test('file and desktop routes reject parent traversal and sibling paths', async (t) => {
  const { base, root, call, opened } = await fixture(t)
  for (const path of [root + '/../outside.txt', join(base, 'outside.txt')]) {
    assert.equal((await call('file', path)).status, 403)
    assert.equal((await call('open', path)).status, 403)
  }
  assert.deepEqual(opened, [])
  const response = await call('file', join(root, 'inside.txt'))
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'inside')
  assert.equal((await call('open', join(root, 'inside.txt'))).status, 204)
  assert.deepEqual(opened, [await realpath(join(root, 'inside.txt'))])
  assert.equal((await call('file', 'relative.txt')).status, 400)
  assert.equal((await call('file', join(root, 'missing.txt'))).status, 404)
})

test('workspace roots may themselves be symlink aliases', async (t) => {
  const { base, root, call, services } = await fixture(t)
  const alias = join(base, 'workspace-alias')
  await symlink(root, alias, 'dir')
  services.workingDirectory.defaultDirectory = alias
  const response = await call('file', join(root, 'inside.txt'))
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'inside')
})

test('outside symlinks stay forbidden before and after a scan', async (t) => {
  const { base, root, call } = await fixture(t)
  const link = join(root, 'link.txt')
  await symlink(join(base, 'outside.txt'), link)
  for (const action of ['file', 'open']) assert.equal((await call(action, link)).status, 403)
  const list = await (await call('list')).json()
  assert.equal(list.items.some((item) => item.path === link), false)
  for (const action of ['file', 'open']) assert.equal((await call(action, link)).status, 403)
})

test('inside symlinks work, but retargeting a listed link grants no outside access', async (t) => {
  const { base, root, call } = await fixture(t)
  const link = join(root, 'link.txt')
  await symlink(join(root, 'inside.txt'), link)
  await call('list')
  const response = await call('file', link)
  assert.equal(await response.text(), 'inside')
  await unlink(link)
  await symlink(join(base, 'outside.txt'), link)
  for (const action of ['file', 'open']) assert.equal((await call(action, link)).status, 403)
})

test('requested aliases resolving into the workspace remain readable', async (t) => {
  const { base, root, call } = await fixture(t)
  const alias = join(base, 'workspace-alias')
  await symlink(root, alias, 'dir')
  const response = await call('file', join(alias, 'inside.txt'))
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'inside')
})

test('explicitly presented outside files retain access, without trusting a retargeted link', async (t) => {
  let declared
  const query = {
    listEvents: async () => [{ type: 'deliverables/presented', seq: 1 }],
    readEvent: async () => ({ target: { time: Date.now(), data: { files: [{ path: declared }] } } }),
  }
  const { base, root, call } = await fixture(t, {
    sessionQuery: query,
    sessionController: { list: async () => ({ items: [{ sessionId: 's1', updatedAt: Date.now() }] }) },
  })
  declared = join(base, 'declared.txt')
  await symlink(join(base, 'outside.txt'), declared)
  let list
  for (let attempt = 0; attempt < 30; attempt++) {
    list = await (await call('list')).json()
    if (list.items.some((item) => item.path === declared)) break
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.equal(list.items.some((item) => item.path === declared), true)
  const response = await call('file', declared)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'outside')
  await unlink(declared)
  await writeFile(join(base, 'different.txt'), 'different')
  await symlink(join(base, 'different.txt'), declared)
  assert.equal((await call('file', declared)).status, 403)
})


test('default list returns every file above 40 and keeps per-file delete tickets stable', async (t) => {
  const { root, call } = await fixture(t)
  for (let i = 0; i < 215; i++) await writeFile(join(root, `file-${i}.txt`), String(i))
  const first = await (await call('list')).json()
  const second = await (await call('list')).json()
  assert.equal(first.items.length, 216)
  assert.equal(first.stats.shown, 216)
  assert.equal(first.stats.merged, 216)
  assert.equal(first.stats.truncated, false)
  assert.equal(first.stats.scanTruncated, false)
  assert.equal(second.items[0].deleteToken, first.items[0].deleteToken)
})

test('deleting a displayed file trashes its exact literal name and updates counts', async (t) => {
  let moved
  const f = await fixture(t, {}, {}, async (path, options) => {
    assert.equal(options.glob, false)
    moved = join(f.base, 'trashed.txt')
    await rename(path, moved)
  })
  const path = join(f.root, '[star]*.txt')
  await writeFile(path, 'selected file')
  const first = await (await f.call('list')).json()
  const item = first.items.find((item) => item.path === path)
  const response = await f.call('delete', path, { path, token: item.deleteToken })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).recoverable, true)
  await assert.rejects(access(path))
  await access(moved)
  await access(join(f.root, 'inside.txt'))
  const after = await (await f.call('list')).json()
  assert.equal(after.items.length, first.items.length - 1)
  assert.equal(after.stats.shown, first.items.length - 1)
  assert.equal(after.items.some((item) => item.path === path), false)
})

test('deletion refuses unlisted paths, directories and forged tokens', async (t) => {
  let calls = 0
  const f = await fixture(t, {}, {}, async () => { calls++ })
  const list = await (await f.call('list')).json()
  const item = list.items[0]
  for (const body of [
    { path: item.path, token: 'forged' },
    { path: f.root + '/../outside.txt', token: item.deleteToken },
    { path: f.root, token: item.deleteToken },
  ]) assert.equal((await f.call('delete', body.path, body)).status, 403)
  assert.equal(calls, 0)
  await access(item.path)
})

test('a changed file or retargeted link cannot be deleted using a stale ticket', async (t) => {
  let calls = 0
  const f = await fixture(t, {}, {}, async () => { calls++ })
  const path = join(f.root, 'inside.txt')
  let list = await (await f.call('list')).json()
  const item = list.items.find((item) => item.path === path)
  await writeFile(path, 'changed since list with a different size')
  assert.equal((await f.call('delete', path, { path, token: item.deleteToken })).status, 409)
  const link = join(f.root, 'link.txt')
  await symlink(path, link)
  list = await (await f.call('list')).json()
  const linked = list.items.find((item) => item.path === link)
  await unlink(link)
  await symlink(join(f.base, 'outside.txt'), link)
  assert.equal((await f.call('delete', link, { path: link, token: linked.deleteToken })).status, 409)
  assert.equal(calls, 0)
})

test('deleting a link trashes the link and preserves the target', async (t) => {
  const f = await fixture(t, {}, {}, async (path) => {
    assert.equal((await lstat(path)).isSymbolicLink(), true)
    await rename(path, join(f.base, 'trashed-link.txt'))
  })
  const target = join(f.root, 'inside.txt')
  const link = join(f.root, 'link.txt')
  await symlink(target, link)
  const list = await (await f.call('list')).json()
  const item = list.items.find((item) => item.path === link)
  assert.equal((await f.call('delete', link, { path: link, token: item.deleteToken })).status, 200)
  await access(target)
  await assert.rejects(lstat(link))
})

test('trash failures keep the file and its list entry', async (t) => {
  const f = await fixture(t, {}, {}, async () => { throw new Error('trash unavailable') })
  const list = await (await f.call('list')).json()
  const item = list.items[0]
  const response = await f.call('delete', item.path, { path: item.path, token: item.deleteToken })
  assert.equal(response.status, 502)
  await access(item.path)
  assert.equal((await (await f.call('list')).json()).items.length, list.items.length)
})

test('duplicate delete requests trash a file only once', async (t) => {
  let release, entered, calls = 0
  const started = new Promise((resolve) => { entered = resolve })
  const gate = new Promise((resolve) => { release = resolve })
  const f = await fixture(t, {}, {}, async (path) => {
    calls++; entered(); await gate; await rename(path, join(f.base, 'trashed.txt'))
  })
  const item = (await (await f.call('list')).json()).items[0]
  const body = { path: item.path, token: item.deleteToken }
  const first = f.call('delete', item.path, body)
  await started
  const second = await f.call('delete', item.path, body)
  assert.equal(second.status, 409)
  release()
  assert.equal((await first).status, 200)
  assert.equal(calls, 1)
})

test('lists in flight during deletion retry rather than resurrecting removed entries', async (t) => {
  const f = await fixture(t, {}, {}, async (path) => rename(path, join(f.base, 'trashed.txt')))
  const item = (await (await f.call('list')).json()).items[0]
  let release, entered, calls = 0
  const started = new Promise((resolve) => { entered = resolve })
  const gate = new Promise((resolve) => { release = resolve })
  f.services.sessionController.list = async () => {
    calls++
    if (calls === 1) { entered(); await gate }
    return { items: [] }
  }
  const pendingList = f.call('list')
  await started
  assert.equal((await f.call('delete', item.path, { path: item.path, token: item.deleteToken })).status, 200)
  release()
  assert.equal((await (await pendingList).json()).items.length, 0)
  assert.ok(calls >= 2)
})

test('unlimited defaults include old declarations beyond the former 16-session window', async (t) => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ sessionId: `old-${i}`, updatedAt: Date.now() - 120 * 86400000 }))
  let base
  const query = {
    listEvents: async () => [{ type: 'deliverables/presented', seq: 1 }],
    readEvent: async ({ sessionId }) => ({ target: { time: 1, data: { files: [{ path: join(base, `${sessionId}.txt`) }] } } }),
  }
  const f = await fixture(t, {
    sessionController: { list: async () => ({ items: rows }) }, sessionQuery: query,
  }, { includeFiles: false })
  base = f.base
  for (const row of rows) await writeFile(join(base, `${row.sessionId}.txt`), row.sessionId)
  let list
  for (let i = 0; i < 100; i++) {
    list = await (await f.call('list')).json()
    if (!list.stats.presentPending) break
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.equal(list.items.length, 23)
  assert.equal(list.stats.presentPending, false)
  assert.equal(list.stats.declaredShown, 23)
})

test('delete route requires POST and a small JSON body', async (t) => {
  const routes = new Map()
  apply({ effect: (fn) => { t.after(fn()) }, get: () => undefined,
    connection: { fetch: { register: (route) => routes.set(route.path, route.fetch) } } }, {})
  const route = routes.get('/api/recent-deliverables.delete')
  for (const [options, expected] of [
    [{ method: 'GET' }, 405],
    [{ method: 'POST', body: '{}' }, 415],
    [{ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }, 400],
    [{ method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(17000) }, 413],
  ]) assert.equal((await route(new Request('http://localhost/api/recent-deliverables.delete', options))).status, expected)
})


test('batch trash validates each selection, deduplicates it, and reports partial success', async (t) => {
  const f = await fixture(t, {}, {}, async (paths, options) => {
    assert.equal(options.glob, false)
    assert.equal(paths.length, 2)
    await rename(paths[0], join(f.base, 'trashed.txt'))
    throw new Error('Second file is busy')
  })
  await writeFile(join(f.root, 'keep.txt'), 'keep')
  const list = await (await f.call('list')).json()
  const files = list.items.map((item) => ({ path: item.path, token: item.deleteToken }))
  const response = await f.call('delete-batch', '', { files: [...files, files[0], { path: join(f.base, 'outside.txt'), token: 'forged' }] })
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.results.length, 3)
  assert.equal(result.deleted, 1)
  assert.equal(result.results.filter((item) => item.error === 'trash-failed').length, 1)
  assert.equal(result.results.filter((item) => item.error === 'not-listed').length, 1)
  assert.equal((await (await f.call('list')).json()).items.length, 1)
  assert.equal(await readFile(join(f.base, 'outside.txt'), 'utf8'), 'outside')
})

test('batch trash refuses changed files, empty selections and oversized batches', async (t) => {
  let calls = 0
  const f = await fixture(t, {}, {}, async () => { calls++ })
  const item = (await (await f.call('list')).json()).items[0]
  await writeFile(item.path, 'changed content')
  const result = await (await f.call('delete-batch', '', { files: [{ path: item.path, token: item.deleteToken }] })).json()
  assert.equal(result.results[0].error, 'file-changed')
  assert.equal(calls, 0)
  for (const files of [[], Array(201).fill({})]) assert.equal((await f.call('delete-batch', '', { files })).status, 400)
})

test('rename changes the real filename and preserves content, count and a usable new ticket', async (t) => {
  const f = await fixture(t, {}, {}, async (path) => rename(path, join(f.base, 'trashed-renamed.txt')))
  const item = (await (await f.call('list')).json()).items[0]
  const response = await f.call('rename', '', { path: item.path, token: item.deleteToken, name: '新报告.md' })
  assert.equal(response.status, 200)
  const renamed = (await response.json()).item
  assert.equal(renamed.name, '新报告.md')
  assert.equal(renamed.path, join(f.root, '新报告.md'))
  assert.notEqual(renamed.deleteToken, item.deleteToken)
  assert.equal(await readFile(renamed.path, 'utf8'), 'inside')
  await assert.rejects(access(item.path))
  assert.equal((await (await f.call('list')).json()).items.length, 1)
  assert.equal((await f.call('delete', renamed.path, { path: renamed.path, token: renamed.deleteToken })).status, 200)
})

test('rename never overwrites an existing file or accepts separators and Windows reserved names', async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.root, 'taken.txt'), 'precious')
  const item = (await (await f.call('list')).json()).items.find((item) => item.name === 'inside.txt')
  for (const name of ['../outside.txt', 'a/b.txt', 'a\\b.txt', '', 'CON.txt', 'report.txt.', 'report.txt ']) {
    assert.equal((await f.call('rename', '', { path: item.path, token: item.deleteToken, name })).status, 400, name)
  }
  assert.equal((await f.call('rename', '', { path: item.path, token: item.deleteToken, name: 'taken.txt' })).status, 409)
  assert.equal(await readFile(item.path, 'utf8'), 'inside')
  assert.equal(await readFile(join(f.root, 'taken.txt'), 'utf8'), 'precious')
})

test('rename rejects forged and stale tickets, including a swapped symlink', async (t) => {
  const f = await fixture(t)
  const item = (await (await f.call('list')).json()).items[0]
  assert.equal((await f.call('rename', '', { path: item.path, token: 'forged', name: 'x.txt' })).status, 403)
  await writeFile(item.path, 'changed')
  assert.equal((await f.call('rename', '', { path: item.path, token: item.deleteToken, name: 'x.txt' })).status, 409)
  const link = join(f.root, 'link.txt')
  await symlink(item.path, link, 'file')
  const linkItem = (await (await f.call('list')).json()).items.find((item) => item.path === link)
  await unlink(link)
  await symlink(join(f.base, 'outside.txt'), link, 'file')
  assert.equal((await f.call('rename', '', { path: link, token: linkItem.deleteToken, name: 'new-link.txt' })).status, 409)
})

test('renaming a symlink keeps its target and the link itself', async (t) => {
  const f = await fixture(t)
  const target = join(f.root, 'inside.txt'), link = join(f.root, 'link.txt')
  await symlink(target, link, 'file')
  const item = (await (await f.call('list')).json()).items.find((item) => item.path === link)
  const response = await f.call('rename', '', { path: link, token: item.deleteToken, name: 'renamed-link.txt' })
  assert.equal(response.status, 200)
  const renamed = (await response.json()).item
  assert.equal((await lstat(renamed.path)).isSymbolicLink(), true)
  assert.equal(await readlink(renamed.path), await readlink(target).catch(() => target))
  assert.equal(await readFile(target, 'utf8'), 'inside')
})

test('metadata write failure rolls back the destination without losing the original', async (t) => {
  const f = await fixture(t)
  const item = (await (await f.call('list')).json()).items[0]
  await mkdir(join(f.base, 'rename-history.json'))
  const response = await f.call('rename', '', { path: item.path, token: item.deleteToken, name: 'new.txt' })
  assert.equal(response.status, 502)
  assert.equal(await readFile(item.path, 'utf8'), 'inside')
  await assert.rejects(access(join(f.root, 'new.txt')))
})

test('renames with no extension stay listed after refresh and reload', async (t) => {
  const f = await fixture(t)
  const item = (await (await f.call('list')).json()).items[0]
  const response = await f.call('rename', '', { path: item.path, token: item.deleteToken, name: '无扩展名' })
  assert.equal(response.status, 200)
  const renamed = (await (await f.call('list')).json()).items
  assert.equal(renamed.length, 1)
  assert.equal(renamed[0].name, '无扩展名')
})

test('renamed declared files outside roots survive a new plugin instance', async (t) => {
  let declared
  const extra = {
    sessionQuery: { listEvents: async () => [{ type: 'deliverables/presented', seq: 1 }],
      readEvent: async () => ({ target: { time: Date.now(), data: { files: [{ path: declared }] } } }) },
    sessionController: { list: async () => ({ items: [{ sessionId: 's1', updatedAt: Date.now() }] }) },
  }
  const f = await fixture(t, extra)
  declared = join(f.base, 'outside.txt')
  let item
  for (let i = 0; i < 30 && !item; i++) {
    item = (await (await f.call('list')).json()).items.find((row) => row.path === declared)
    if (!item) await new Promise((resolve) => setTimeout(resolve, 5))
  }
  const response = await f.call('rename', '', { path: declared, token: item.deleteToken, name: 'outside-new.txt' })
  assert.equal(response.status, 200)
  const target = (await response.json()).item.path
  const routes = new Map()
  createPlugin(undefined, { renameMapFile: join(f.base, 'rename-history.json') })({
    effect: (fn) => { const dispose = fn(); t.after(dispose) }, get: (name) => f.services[name],
    connection: { fetch: { register: (route) => routes.set(route.path, route.fetch) } },
  }, { includeFiles: false, cacheMs: 0 })
  let list
  for (let i = 0; i < 30; i++) {
    list = await (await routes.get('/api/recent-deliverables.list')(new Request('http://localhost'))).json()
    if (list.items.some((row) => row.path === target)) break
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.equal(list.items.some((row) => row.path === target && row.origin === 'present'), true)
})

test('repeated renames can return to the original name without alias cycles', async (t) => {
  const f = await fixture(t)
  let item = (await (await f.call('list')).json()).items[0]
  for (const name of ['second.txt', 'third.txt', 'inside.txt', 'final.txt']) {
    const response = await f.call('rename', '', { path: item.path, token: item.deleteToken, name })
    assert.equal(response.status, 200)
    item = (await response.json()).item
    const list = await (await f.call('list')).json()
    assert.equal(list.items.length, 1)
    assert.equal(list.items[0].name, name)
  }
})
