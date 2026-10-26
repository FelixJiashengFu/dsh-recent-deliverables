import { readFile, writeFile, mkdir, rename, unlink, stat, opendir } from 'node:fs/promises'
import { dirname, isAbsolute, resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'

export const BUILTIN_CATEGORIES = ['all', 'present', 'pdf', 'web', 'doc', 'sheet', 'slide', 'image', 'text', 'media', 'archive', 'other']
const error = (code, status = 400, path) => Object.assign(new Error(code), { code, status, path })
const label = (value, length = 64) => typeof value === 'string' ? value.trim().slice(0, length) : ''
const list = (value, max = 512) => { if (!Array.isArray(value)) return []; if (value.length > max) throw error('too-many-settings'); return value }
const unique = (values) => [...new Set(values)]
export function directoryPath(value) {
  let path = label(value, 4096)
  if (path === '~') path = homedir()
  else if (/^~[/\\]/.test(path)) path = join(homedir(), path.slice(2))
  if (!isAbsolute(path) || /[\u0000-\u001f]/.test(path)) throw error('invalid-directory', 400, path)
  return resolve(path)
}

export function normalizeOrganizer(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const categories = source.categories || {}, directories = source.directories || {}
  const custom = list(categories.custom, 32).map((item) => {
    if (!/^custom-[a-z0-9-]{1,80}$/.test(item?.id || '') || !label(item?.name, 48)) throw error('invalid-category')
    const extensions = unique(list(item.extensions, 80).map((ext) => label(ext, 20).replace(/^\./, '').toLowerCase()).filter(Boolean))
    if (extensions.some((ext) => !/^[a-z0-9]{1,16}$/.test(ext))) throw error('invalid-extension')
    const contains = label(item.contains, 120)
    if (!extensions.length && !contains) throw error('empty-category-rule')
    return { id: item.id, name: label(item.name, 48), extensions, contains }
  })
  if (unique(custom.map((item) => item.id)).length !== custom.length) throw error('duplicate-category')
  const validIds = new Set([...BUILTIN_CATEGORIES, ...custom.map((item) => item.id)])
  const names = list(categories.names, 64).map((item) => ({ id: item?.id, label: label(item?.label, 48) }))
    .filter((item) => validIds.has(item.id) && item.label)
  const hidden = unique(list(categories.hidden, 64).filter((id) => validIds.has(id) && id !== 'all'))
  const order = unique(list(categories.order, 64).filter((id) => validIds.has(id)))
  return { categories: { names, hidden, order, custom }, directories: {
    extra: unique(list(directories.extra, 100).map(directoryPath)),
    disabled: unique(list(directories.disabled).map(directoryPath)),
    names: list(directories.names).map((item) => ({ path: directoryPath(item?.path), label: label(item?.label) })).filter((item) => item.label),
    order: unique(list(directories.order).map(directoryPath)),
  } }
}

export function organizerRevision(preferences) { return createHash('sha256').update(JSON.stringify(preferences)).digest('hex') }

export function createOrganizerStore(file) {
  let preferences = normalizeOrganizer(), revision = organizerRevision(preferences), failure = null, queue = Promise.resolve()
  const ready = (async () => {
    if (!file) return
    try {
      const data = JSON.parse(await readFile(file, 'utf8'))
      if (data.version !== 1) throw error('invalid-organizer-file')
      preferences = normalizeOrganizer(data.preferences); revision = organizerRevision(preferences)
    } catch (err) { if (err.code !== 'ENOENT') failure = err }
  })()
  return {
    ready,
    snapshot: () => ({ preferences, revision, error: failure ? 'organizer-unavailable' : null }),
    async save(value, expected) {
      let release
      const previous = queue; queue = new Promise((resolve) => { release = resolve })
      await previous
      try {
        await ready
        if (failure) throw error('organizer-unavailable', 503)
        if (expected !== revision) throw error('organizer-conflict', 409)
        const next = normalizeOrganizer(value)
        for (const path of next.directories.extra) {
          if (preferences.directories.extra.includes(path)) continue
          try {
            if (!(await stat(path)).isDirectory()) throw error('directory-unavailable')
            const handle = await opendir(path); await handle.close()
          } catch { throw error('directory-unavailable', 400, path) }
        }
        if (file) {
          const temporary = `${file}.${randomUUID()}.tmp`
          try {
            await mkdir(dirname(file), { recursive: true, mode: 0o700 })
            await writeFile(temporary, JSON.stringify({ version: 1, preferences: next }), { mode: 0o600 })
            await rename(temporary, file)
          } catch { throw error('organizer-save-failed', 503) }
          finally { await unlink(temporary).catch(() => {}) }
        }
        preferences = next; revision = organizerRevision(preferences)
        return this.snapshot()
      } finally { release() }
    },
  }
}
