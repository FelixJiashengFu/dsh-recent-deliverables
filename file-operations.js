import { constants } from 'node:fs'
import { lstat, link, copyFile, readlink, symlink, unlink, utimes, chmod, readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'

export function validFileName(value) {
  return typeof value === 'string' && value.length > 0 && value !== '.' && value !== '..' &&
    !/[<>:"/\\|?*\u0000-\u001f]/.test(value) && !/[. ]$/.test(value) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) && Buffer.byteLength(value, 'utf8') <= 255
}

export function entryKey(info) {
  return [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs, info.mode].join(':')
}

function operationError(code) { return Object.assign(new Error(code), { code }) }

/** Prepare an exclusive new name; keep the original until metadata is saved. */
export async function prepareRename(from, to, expectedKey) {
  const original = await lstat(from)
  if (entryKey(original) !== expectedKey) throw operationError('FILE_CHANGED')
  if (!original.isFile() && !original.isSymbolicLink()) throw operationError('NOT_FILE')
  let made
  const rollback = async () => {
    try {
      const current = await lstat(to)
      if (made && current.dev === made.dev && current.ino === made.ino) await unlink(to)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  try {
    if (original.isSymbolicLink()) {
      await symlink(await readlink(from), to, 'file')
    } else {
      try { await link(from, to) }
      catch (error) {
        if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS'].includes(error.code)) throw error
        await copyFile(from, to, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
        made = await lstat(to)
        await chmod(to, original.mode)
        await utimes(to, original.atime, original.mtime)
      }
    }
    made = await lstat(to)
    if (original.isFile() !== made.isFile() || original.isSymbolicLink() !== made.isSymbolicLink()) {
      throw operationError('FILE_CHANGED')
    }
    return {
      rollback,
      async commit() {
        const current = await lstat(from)
        // Hard-link creation changes ctime; content identity and the entry must remain the same.
        if (current.dev !== original.dev || current.ino !== original.ino || current.size !== original.size ||
            current.mtimeMs !== original.mtimeMs || current.mode !== original.mode) throw operationError('FILE_CHANGED')
        await unlink(from)
      },
    }
  } catch (error) {
    await rollback().catch(() => {})
    throw error
  }
}

export async function loadAliases(file) {
  if (!file) return new Map()
  try {
    const data = JSON.parse(await readFile(file, 'utf8'))
    if (data.version !== 1 || !Array.isArray(data.aliases)) throw new Error('Invalid rename history')
    return new Map(data.aliases.filter((entry) => Array.isArray(entry) && entry.length === 2 &&
      entry.every((path) => typeof path === 'string' && isAbsolute(path))))
  } catch (error) { if (error.code === 'ENOENT') return new Map(); throw error }
}

export async function saveAliases(file, aliases) {
  if (!file) return
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, aliases: [...aliases] }), { mode: 0o600 })
    await rename(temporary, file)
  } finally { await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error }) }
}

export function followAlias(aliases, path) {
  const visited = new Set()
  let current = path
  while (aliases.has(current)) {
    if (visited.has(current)) return path
    visited.add(current)
    current = aliases.get(current)
  }
  return current
}
