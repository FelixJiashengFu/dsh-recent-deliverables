/**
 * Pure helpers for the Recent Deliverables bundle.
 *
 * This module is deliberately dependency-free (Node built-ins only) so the Host
 * half can import it and a plain `node` test harness can exercise it without the
 * DSH runtime. Nothing here touches the filesystem or Cordis.
 * @module dsh-recent-deliverables/logic
 */

/** Directories that never contain a user-facing deliverable we want to list. */
export const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.gradle',
  '.idea',
  '.vscode',
  '.Trash',
  'Library',
  'dist',
  'build',
  'out',
  'coverage',
  'target',
  'vendor',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.parcel-cache',
  '.cache',
  '.git',
  '.hg',
  '.svn',
])

/** Every kind the panel knows, in the order the filter row shows them. */
export const KIND_ORDER = ['pdf', 'web', 'doc', 'sheet', 'slide', 'image', 'text', 'media', 'archive', 'other']

/** File extension (lowercase, no dot) to kind. Anything unlisted is ignored by default. */
export const KIND_BY_EXT = Object.freeze({
  pdf: 'pdf',
  html: 'web',
  htm: 'web',
  xhtml: 'web',
  doc: 'doc',
  docx: 'doc',
  odt: 'doc',
  rtf: 'doc',
  pages: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  xlsm: 'sheet',
  csv: 'sheet',
  tsv: 'sheet',
  ods: 'sheet',
  numbers: 'sheet',
  ppt: 'slide',
  pptx: 'slide',
  odp: 'slide',
  key: 'slide',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  avif: 'image',
  bmp: 'image',
  tif: 'image',
  tiff: 'image',
  heic: 'image',
  md: 'text',
  markdown: 'text',
  txt: 'text',
  tex: 'text',
  rst: 'text',
  log: 'text',
  ipynb: 'text',
  mp4: 'media',
  mov: 'media',
  webm: 'media',
  m4v: 'media',
  mp3: 'media',
  wav: 'media',
  m4a: 'media',
  aac: 'media',
  zip: 'archive',
  gz: 'archive',
  tgz: 'archive',
  tar: 'archive',
  bz2: 'archive',
  '7z': 'archive',
  rar: 'archive',
})

/** Kinds the panel can render inline in its own preview modal. */
export const PREVIEWABLE_KINDS = new Set(['pdf', 'web', 'image', 'text'])

/** MIME type served for the inline preview / new-tab open route. */
const MIME_BY_EXT = Object.freeze({
  pdf: 'application/pdf',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  xhtml: 'application/xhtml+xml',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  md: 'text/plain; charset=utf-8',
  markdown: 'text/plain; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  tex: 'text/plain; charset=utf-8',
  rst: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  ipynb: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',
  json: 'application/json; charset=utf-8',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  zip: 'application/zip',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  tar: 'application/x-tar',
  bz2: 'application/x-bzip2',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  pages: 'application/octet-stream',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  numbers: 'application/octet-stream',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  key: 'application/octet-stream',
})

/** The default extension allowlist: every key of {@link KIND_BY_EXT}. */
export const DEFAULT_EXTENSIONS = Object.freeze(new Set(Object.keys(KIND_BY_EXT)))

/** Normalize one declared extension (`".PDF"` / `"pdf"` → `"pdf"`). */
export function normalizeExtension(value) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase().replace(/^\.+/, '')
}

/** Lowercase file extension without the dot; `''` when the name has none. */
export function extnameOf(path) {
  if (typeof path !== 'string') return ''
  const name = path.slice(path.replace(/\\/g, '/').lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

/** Final path segment for either separator spelling. */
export function basenameOf(path) {
  if (typeof path !== 'string' || path.length === 0) return ''
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const at = normalized.lastIndexOf('/')
  return at === -1 ? normalized : normalized.slice(at + 1)
}

/** Kind for a path, or `null` when the extension is outside the allowlist. */
export function kindOfPath(path, extensions = DEFAULT_EXTENSIONS) {
  const ext = extnameOf(path)
  if (ext === '' || !extensions.has(ext)) return null
  return KIND_BY_EXT[ext] ?? 'other'
}

/** Whether a filename is a macOS AppleDouble/resource-fork or a Finder artifact. */
export function isJunkFileName(name) {
  if (typeof name !== 'string' || name.length === 0) return true
  return name.startsWith('.') || name === 'Thumbs.db' || name === 'desktop.ini'
}

/** Whether a directory name is on the skip list (case-insensitive on Windows). */
export function isSkippedDirName(name) {
  if (typeof name !== 'string' || name.length === 0) return true
  if (name === '.' || name === '..') return true
  if (name.startsWith('.')) return true
  return SKIP_DIR_NAMES.has(name)
}

/** Whether a path is absolute in either spelling the Host accepts. */
export function isAbsolutePath(path) {
  return typeof path === 'string' && (path.startsWith('/') || /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\'))
}

/** Resolve a workspace-relative path against a known root, leaving absolute paths alone. */
export function toAbsolutePath(path, cwd) {
  if (typeof path !== 'string' || path.trim().length === 0) return ''
  const value = path.trim()
  if (isAbsolutePath(value)) return value
  if (typeof cwd !== 'string' || cwd.length === 0) return value
  const separator = isAbsolutePath(cwd) && cwd.includes('\\') && !cwd.includes('/') ? '\\' : '/'
  return `${cwd.replace(/[/\\]+$/, '')}${separator}${value.replace(/^[/\\]+/, '')}`
}

/** Trim trailing separators (but keep a filesystem root intact). */
export function withoutTrailingSeparators(path) {
  if (typeof path !== 'string') return ''
  const trimmed = path.replace(/[/\\]+$/, '')
  if (trimmed === '' && /^[/\\]/.test(path)) return '/'
  if (/^[A-Za-z]:$/.test(trimmed)) return `${trimmed}/`
  return trimmed
}

/** Whether `candidate` is `parent` itself or lives inside it. */
export function isPathInside(parent, candidate) {
  if (typeof parent !== 'string' || typeof candidate !== 'string') return false
  if (parent.length === 0 || candidate.length === 0) return false
  const root = withoutTrailingSeparators(parent.replace(/\\/g, '/'))
  const full = withoutTrailingSeparators(candidate.replace(/\\/g, '/'))
  if (root === '' || root === '/') return full.startsWith('/')
  if (process.platform === 'win32') {
    const lowerRoot = root.toLowerCase()
    const lowerFull = full.toLowerCase()
    return lowerFull === lowerRoot || lowerFull.startsWith(`${lowerRoot}/`)
  }
  return full === root || full.startsWith(`${root}/`)
}

/** Sort an array of deliverable-ish records newest-first, then by name. */
export function compareByMtimeDesc(left, right) {
  const a = Number.isFinite(left?.mtime) ? left.mtime : 0
  const b = Number.isFinite(right?.mtime) ? right.mtime : 0
  if (a !== b) return b - a
  const nameA = typeof left?.name === 'string' ? left.name : ''
  const nameB = typeof right?.name === 'string' ? right.name : ''
  return nameA.localeCompare(nameB)
}

/**
 * Merge declared deliverables (Session `deliverables/presented` events) with the
 * recently modified files found by the workspace scan.
 *
 * A path present in both sources keeps the declared metadata (description,
 * Session identity) and the newest mtime, so it is listed once and still sorts
 * by when it was produced. Declared deliverables keep a reserved slice of the
 * list (`declaredSlots`) so a burst of freshly generated intermediate files can
 * never push the actual finished deliverables out of the panel; the newest
 * files fill the rest, and the combined list is sorted by mtime and truncated
 * to `maxItems`.
 * @param present - items carrying `origin: 'present'` plus declarations.
 * @param files - items carrying `origin: 'file'`.
 * @param maxItems - hard cap on the returned list length.
 * @param declaredSlots - reserved declared items kept ahead of the fill (default 12).
 * @returns the merged list and the counts the footer reports.
 */
export function mergeDeliverables(present, files, maxItems, declaredSlots) {
  const merged = new Map()
  for (const item of Array.isArray(files) ? files : []) {
    if (!item || typeof item.path !== 'string' || item.path.length === 0) continue
    merged.set(item.path, { ...item })
  }
  let declared = 0
  for (const item of Array.isArray(present) ? present : []) {
    if (!item || typeof item.path !== 'string' || item.path.length === 0) continue
    declared += 1
    const previous = merged.get(item.path)
    if (previous === undefined) {
      merged.set(item.path, { ...item })
      continue
    }
    merged.set(item.path, {
      ...previous,
      origin: 'present',
      description: item.description ?? previous.description,
      sessionId: item.sessionId ?? previous.sessionId,
      sessionTitle: item.sessionTitle ?? previous.sessionTitle,
      seq: item.seq ?? previous.seq,
      presentedAt: item.presentedAt ?? previous.presentedAt,
      mtime: Math.max(Number(previous.mtime) || 0, Number(item.mtime) || 0) || previous.mtime,
    })
  }
  const all = [...merged.values()].sort(compareByMtimeDesc)
  const cap = Number.isSafeInteger(maxItems) && maxItems > 0 ? maxItems : 40
  const slots =
    Number.isSafeInteger(declaredSlots) && declaredSlots >= 0 ? Math.min(declaredSlots, cap) : Math.min(12, cap)
  const declaredItems = all.filter((item) => item.origin === 'present')
  const keptDeclared = declaredItems.slice(0, slots)
  const reserved = new Set(keptDeclared.map((item) => item.path))
  const remaining = all.filter((item) => !reserved.has(item.path)).slice(0, cap - keptDeclared.length)
  const items = [...keptDeclared, ...remaining].sort(compareByMtimeDesc)
  return {
    items,
    counts: {
      merged: all.length,
      declared,
      declaredShown: items.filter((item) => item.origin === 'present').length,
      scanned: (Array.isArray(files) ? files : []).length,
      shown: items.length,
      truncated: all.length > items.length,
    },
  }
}

/** MIME type + whether the browser can reasonably display this path inline. */
export function mediaOfPath(path) {
  const ext = extnameOf(path)
  const kind = KIND_BY_EXT[ext] ?? 'other'
  return {
    ext,
    kind,
    mime: MIME_BY_EXT[ext] ?? 'application/octet-stream',
    inline: PREVIEWABLE_KINDS.has(kind) || ext === 'csv' || ext === 'tsv' || ext === 'json',
  }
}

/**
 * Normalize the Loader row `config` into the complete option set the Host uses.
 * Unknown keys are ignored and invalid values fall back to the documented
 * default instead of failing the plugin, so a typo can never disable the panel.
 */
export function normalizeConfig(config) {
  const source = config !== null && typeof config === 'object' ? config : {}
  const integer = (value, fallback, min, max) =>
    Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback
  const extensions = new Set()
  if (Array.isArray(source.extensions) && source.extensions.length > 0) {
    for (const value of source.extensions) {
      const normalized = normalizeExtension(value)
      if (normalized !== '') extensions.add(normalized)
    }
  }
  const declaredRoots = Array.isArray(source.extraRoots)
    ? source.extraRoots.filter((value) => typeof value === 'string' && value.trim().length > 0)
    : []
  const ignoredRoots = Array.isArray(source.ignoreRoots)
    ? source.ignoreRoots.filter((value) => typeof value === 'string' && value.trim().length > 0)
    : []
  return {
    maxItems: integer(source.maxItems, 40, 1, 200),
    declaredSlots: integer(source.declaredSlots, 12, 0, 200),
    maxSessions: integer(source.maxSessions, 16, 0, 200),
    maxSessionAgeDays: integer(source.maxSessionAgeDays, 60, 0, 3650),
    scanDepth: integer(source.scanDepth, 5, 0, 20),
    maxScanFiles: integer(source.maxScanFiles, 12000, 100, 200000),
    cacheMs: integer(source.cacheMs, 15000, 0, 600000),
    includePresent: source.includePresent !== false,
    includeFiles: source.includeFiles !== false,
    extraRoots: declaredRoots,
    ignoreRoots: ignoredRoots,
    extensions: extensions.size > 0 ? extensions : DEFAULT_EXTENSIONS,
  }
}

/**
 * Coerce one item from the collection pass into the JSON shape the panel reads.
 * Keeps `undefined` out of the payload so the client can rely on field presence.
 * @param item - collected deliverable record.
 * @returns a plain JSON object, or `undefined` for an unusable record.
 */
export function publicItem(item) {
  if (!item || typeof item.path !== 'string' || item.path.length === 0) return undefined
  const path = item.path
  const name = typeof item.name === 'string' && item.name.length > 0 ? item.name : basenameOf(path)
  const declared = item.origin === 'present'
  return {
    path,
    name,
    ext: extnameOf(path),
    kind: typeof item.kind === 'string' ? item.kind : kindOfPath(path) ?? 'other',
    bytes: Number.isFinite(item.bytes) && item.bytes >= 0 ? item.bytes : 0,
    mtime: Number.isFinite(item.mtime) ? item.mtime : 0,
    origin: declared ? 'present' : 'file',
    previewable: mediaOfPath(path).inline,
    ...(typeof item.description === 'string' && item.description.length > 0
      ? { description: item.description }
      : {}),
    ...(typeof item.sessionTitle === 'string' && item.sessionTitle.length > 0
      ? { sessionTitle: item.sessionTitle }
      : {}),
    ...(typeof item.rootLabel === 'string' && item.rootLabel.length > 0
      ? { rootLabel: item.rootLabel }
      : {}),
    ...(typeof item.sessionId === 'string' && item.sessionId.length > 0
      ? { sessionId: item.sessionId }
      : {}),
    ...(Number.isSafeInteger(item.presentedAt) && item.presentedAt > 0
      ? { presentedAt: item.presentedAt }
      : {}),
  }
}
