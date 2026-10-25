import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, unlink, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../index.js'

async function fixture(t, extra = {}) {
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
  apply({
    effect: (fn) => { const dispose = fn(); t.after(dispose) },
    get: (name) => services[name],
    connection: { fetch: { register: (route) => routes.set(route.path, route.fetch) } },
  }, { includePresent: Boolean(extra.sessionQuery), cacheMs: 0 })
  const call = (action, path) => routes.get(`/api/recent-deliverables.${action}`)(
    new Request(`http://localhost/api/recent-deliverables.${action}?path=${encodeURIComponent(path ?? '')}`,
      { method: action === 'open' ? 'POST' : 'GET' }),
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
