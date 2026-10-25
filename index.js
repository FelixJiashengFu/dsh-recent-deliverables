/**
 * Recent Deliverables — Host half.
 *
 * Owns six authenticated Fetch routes inside Connection's authentication
 * fence:
 *
 *   GET  /api/recent-deliverables.list   the merged, newest-first deliverable list
 *   GET  /api/recent-deliverables.file   one listed file's bytes (inline preview)
 *   POST /api/recent-deliverables.open   open / reveal one listed path on the desktop
 *   POST /api/recent-deliverables.delete move one unchanged displayed file to OS trash
 *   POST /api/recent-deliverables.delete-batch move a validated selection to OS trash
 *   POST /api/recent-deliverables.rename rename without replacing an existing entry
 *
 * The list has two sources:
 *
 * 1. Declared deliverables — `deliverables/presented` events appended by the
 *    shipped `present` tool. Read through `ctx.sessionQuery` (never by poking at
 *    session files), newest Sessions first, folded once per Session state and
 *    memoized by `updatedAt`.
 * 2. Recently produced files — a bounded, read-only walk of every known
 *    workspace root (registered workspaces, the default directory, and the
 *    working directories of recent Sessions).
 *
 * Folding Session logs is the expensive part, so it never blocks the list: the
 * first response carries the filesystem scan immediately, the fold runs in the
 * background, and the payload flags `presentPending` so the panel re-asks. No
 * Session log is ever written; file deletion is explicit and recoverable.
 * @module dsh-recent-deliverables
 */
import { createReadStream } from 'node:fs'
import { readdir, realpath, stat, lstat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import trash from 'trash'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { validFileName, entryKey, prepareRename, loadAliases, saveAliases, followAlias } from './file-operations.js'
import { Readable } from 'node:stream'
import {
  basenameOf,
  isAbsolutePath,
  isJunkFileName,
  isPathInside,
  isSkippedDirName,
  kindOfPath,
  mediaOfPath,
  mergeDeliverables,
  normalizeConfig,
  publicItem,
  toAbsolutePath,
  withoutTrailingSeparators,
} from './logic.js'

/** Stable Loader identity. */
export const name = 'recent-deliverables'

/** Connection supplies the authenticated Fetch registry used by the routes. */
export const inject = ['connection']

const LIST_PATH = '/api/recent-deliverables.list'
const FILE_PATH = '/api/recent-deliverables.file'
const OPEN_PATH = '/api/recent-deliverables.open'
const DELETE_PATH = '/api/recent-deliverables.delete'
const BATCH_DELETE_PATH = '/api/recent-deliverables.delete-batch'
const RENAME_PATH = '/api/recent-deliverables.rename'

/** How many Session titles are memoized before the oldest entry is dropped. */
const TITLE_CACHE_LIMIT = 512
/** Milliseconds a folded Session title stays fresh. */
const TITLE_TTL_MS = 120_000
/** Milliseconds a completed background fold is trusted before it re-runs. */
const PRESENT_TTL_MS = 300_000
/** Minimum delay between two background folds, so an actively writing Session
 * (its `updatedAt` changes every event) cannot re-fold on every poll. */
const PRESENT_MIN_INTERVAL_MS = 20_000
/** Per-root minimum slice of the scan budget so a huge root cannot starve the rest. */
const MIN_ROOT_BUDGET = 200

/**
 * Register the routes. No timers, no background work while idle: every
 * collection runs on demand and nothing runs until the panel first asks.
 * @param ctx - Host context carrying the connection Fetch registry.
 * @param config - optional Loader row config (see README.md).
 */
export function createPlugin(trashFile = trash, operations = {}) {
  return (ctx, config) => mount(ctx, config, trashFile, operations)
}

export const apply = createPlugin()

function mount(ctx, config, trashFile, operations) {
  const options = normalizeConfig(config)
  const lifetime = new AbortController()
  const state = {
    options,
    signal: lifetime.signal,
    list: { at: 0, value: null },
    building: null,
    present: {
      status: 'idle',
      items: [],
      signature: '',
      builtAt: 0,
      error: null,
      running: null,
      generation: 0,
    },
    sessions: new Map(),
    titles: new Map(),
    files: { at: 0, rootsKey: '', items: [], visited: 0, truncated: false },
    servable: new Set(),
    deleteTickets: new Map(),
    deleting: new Set(),
    revision: 0,
    aliases: new Map(),
    aliasError: null,
    aliasFile: operations.renameMapFile === false ? null : operations.renameMapFile ||
      join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'recent-deliverables', 'renames.json'),
    renameQueue: Promise.resolve(),
    pendingNames: new Set(),
  }

  state.aliasesReady = loadAliases(state.aliasFile).then((aliases) => { state.aliases = aliases })
    .catch((error) => { state.aliasError = error.message })

  ctx.effect(
    () => () => {
      lifetime.abort()
      state.building = null
      state.present.running = null
    },
    'recent-deliverables: route lifetime',
  )

  /** Wrap one handler in the route lifetime and a JSON failure guard. */
  const serve = (handler) => (request) => {
    const owned = new Request(request, { signal: AbortSignal.any([request.signal, lifetime.signal]) })
    return Promise.resolve()
      .then(() => handler(owned))
      .catch((error) => {
        if (owned.signal.aborted) return new Response(null, { status: 499 })
        return json({ error: 'internal', message: error instanceof Error ? error.message : String(error) }, 500)
      })
  }

  ctx.connection.fetch.register({
    path: LIST_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: serve((request) => listResponse(ctx, state, request)),
  })
  ctx.connection.fetch.register({
    path: FILE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: serve((request) => fileResponse(ctx, state, request)),
  })
  ctx.connection.fetch.register({
    path: OPEN_PATH,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: serve((request) => openResponse(ctx, state, request)),
  })
  ctx.connection.fetch.register({
    path: DELETE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: serve((request) => deleteResponse(state, request, trashFile)),
  })
  ctx.connection.fetch.register({
    path: BATCH_DELETE_PATH, methods: ['POST'], requestBody: 'buffered',
    fetch: serve((request) => batchDeleteResponse(state, request, trashFile)),
  })
  ctx.connection.fetch.register({
    path: RENAME_PATH, methods: ['POST'], requestBody: 'buffered',
    fetch: serve((request) => renameResponse(state, request)),
  })


}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** JSON response with the caching posture every route shares. */
function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * Answer the list route, sharing one build between concurrent callers and
 * reusing the previous payload inside the configured cache window. A payload
 * whose declared half is still folding is deliberately not cached so the
 * follow-up request observes the finished fold.
 * @param ctx - Host context.
 * @param state - plugin state.
 * @param request - owned request.
 * @returns the JSON response.
 */
async function listResponse(ctx, state, request) {
  for (;;) {
    const cached = state.list.value
    if (cached !== null && Date.now() - state.list.at < state.options.cacheMs) return json(cached)
    const building = state.building ?? (state.building = buildList(ctx, state))
    try {
      const built = await building
      // A deletion may have completed while a filesystem scan was in flight.
      if (built.revision !== state.revision) continue
      if (built.cache) state.list = { at: Date.now(), value: built.value }
      return json(built.value)
    } catch (error) {
      if (state.list.value !== null) return json(state.list.value)
      throw error
    } finally {
      if (state.building === building) state.building = null
    }
  }
}

/**
 * Collect both sources, merge, and describe the result.
 * @param ctx - Host context.
 * @param state - plugin state.
 * @returns the payload plus whether it may be cached (a payload whose declared
 *   half is still folding must not be, so the follow-up request sees the fold).
 */
async function buildList(ctx, state) {
  await state.aliasesReady
  const started = Date.now()
  const revision = state.revision
  const options = state.options
  const summaries = await loadSessionSummaries(ctx, state)
  const roots = resolveRoots(ctx, summaries, options)

  // Start (or reuse) the background declared-deliverable fold. Items folded
  // from an earlier Session state stay visible while a refresh is in flight;
  // the scan below is awaited first so a fold that lands during it is included.
  const fold = options.includePresent ? ensurePresentFold(ctx, state, summaries) : undefined
  const files = options.includeFiles ? await scanRoots(state, roots) : []
  const presentSnapshot = state.present.items
  const declared = await Promise.all(presentSnapshot.map(async (item) => {
    const original = item.originalPath || item.path
    let path = followAlias(state.aliases, original)
    if (path !== original && await fileInfo(path) === null) path = original
    return path === item.path ? item : { ...item, path, name: basenameOf(path), kind: kindOfPath(path, options.extensions) ?? 'other' }
  }))
  // Explicitly renamed files stay listed even when their new name has no recognized extension.
  const renamed = [...new Set([...state.aliases.values()].map((path) => followAlias(state.aliases, path)))].map((path) => ({
    path, name: basenameOf(path), kind: kindOfPath(path, options.extensions) ?? 'other', origin: 'file', mtime: 0,
  }))
  const candidates = mergeDeliverables(declared, [...renamed, ...files], 0, options.declaredSlots).items.filter((item) => !state.pendingNames.has(item.path))
  const canonicalRoots = (await Promise.all(roots.map(async (root) => {
    try { return await realpath(root.path) } catch { return undefined }
  }))).filter(Boolean)
  const live = await collectLiveFiles(candidates, canonicalRoots, state.deleteTickets)
  const merged = mergeDeliverables(live.filter((item) => item.origin === 'present'),
    live.filter((item) => item.origin !== 'present'), options.maxItems, options.declaredSlots)
  const items = merged.items.map(publicItem).filter(Boolean)
  // A fold can finish while filesystem work awaits. Only mark complete when this
  // response actually includes that fold, otherwise request a follow-up list.
  const pending = fold !== undefined && (state.present.status !== 'ready' || state.present.items !== presentSnapshot)
  if (revision === state.revision) {
    state.servable = new Set(merged.items.map((item) => item.canonical))
    state.deleteTickets = new Map(merged.items.map((item) => [item.path, item.ticket]))
  }
  const sessionIds = new Set(summaries.map((row) => row.sessionId))
  for (const id of state.sessions.keys()) if (!sessionIds.has(id)) state.sessions.delete(id)

  return {
    revision,
    cache: pending !== true,
    value: {
      items,
      stats: {
        ...merged.counts,
        roots: roots.length,
        sessions: summaries.length,
        visitedFiles: state.files.visited,
        scanTruncated: state.files.truncated,
        presentPending: pending,
        presentStatus: state.present.status,
        durationMs: Date.now() - started,
        at: Date.now(),
      },
      roots: roots.slice(0, 8).map((root) => ({ path: root.path, label: root.label })),
      capabilities: describeCapabilities(ctx),
    },
  }
}

/** Desktop-open availability plus the destination label, for the row actions. */
function describeCapabilities(ctx) {
  const controller = ctx.get('sessionController')
  let desktop
  try {
    desktop = typeof controller?.workspaceDesktop === 'function' ? controller.workspaceDesktop() : undefined
  } catch {
    desktop = undefined
  }
  const available = desktop?.available === true
  return {
    open: available,
    reveal: available,
    trash: true,
    desktop: typeof desktop?.name === 'string' ? desktop.name : null,
  }
}

// ---------------------------------------------------------------------------
// Session-sourced declarations (background fold)
// ---------------------------------------------------------------------------

/**
 * Read visible Session rows, newest activity first.
 *
 * `sessionController.list` is the authoritative cheap listing (it carries
 * `updatedAt`, which the per-Session cache keys off). `sessionQuery.listSessions`
 * is the fallback when the Controller is absent.
 * @param ctx - Host context.
 * @param state - plugin state.
 * @returns normalized summaries.
 */
async function loadSessionSummaries(ctx, state) {
  const controller = ctx.get('sessionController')
  const summaries = []
  if (controller !== undefined && typeof controller.list === 'function') {
    try {
      const value = await controller.list({}, state.signal)
      for (const entry of Array.isArray(value?.items) ? value.items : []) {
        if (entry === null || typeof entry !== 'object' || typeof entry.sessionId !== 'string') continue
        summaries.push({
          sessionId: entry.sessionId,
          updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0,
          cwd: typeof entry.cwd === 'string' && entry.cwd.length > 0 ? entry.cwd : undefined,
          blank: entry.blank === true,
          origin: typeof entry.origin === 'string' ? entry.origin : undefined,
        })
      }
    } catch {
      // Fall through to the query service.
    }
  }
  if (summaries.length === 0) {
    const query = ctx.get('sessionQuery')
    if (query !== undefined && typeof query.listSessions === 'function') {
      const records = await query.listSessions(state.signal)
      for (const record of Array.isArray(records) ? records : []) {
        const header = record?.header
        if (header === undefined || header === null || typeof header.id !== 'string') continue
        summaries.push({
          sessionId: header.id,
          updatedAt: Number.isFinite(header.createdAt) ? header.createdAt : 0,
          cwd: typeof header.cwd === 'string' && header.cwd.length > 0 ? header.cwd : undefined,
          blank: false,
          origin: typeof header.origin === 'string' ? header.origin : undefined,
        })
      }
    }
  }
  summaries.sort((left, right) => right.updatedAt - left.updatedAt)
  return summaries
}

/**
 * The Sessions whose logs the fold reads: non-blank, newest activity first,
 * inside the configured age window and budget.
 * @param summaries - Session rows, newest activity first.
 * @param options - normalized options.
 * @returns at most `maxSessions` rows.
 */
function foldCandidates(summaries, options) {
  const cutoff = options.maxSessionAgeDays > 0 ? Date.now() - options.maxSessionAgeDays * 86400000 : 0
  const candidates = summaries.filter((summary) => !summary.blank && summary.updatedAt >= cutoff)
  return options.maxSessions > 0 ? candidates.slice(0, options.maxSessions) : candidates
}

/** A stable description of the fold inputs, so unchanged inputs skip the fold. */
function foldSignature(candidates) {
  return candidates.map((summary) => `${summary.sessionId}:${summary.updatedAt}`).join('|')
}

/**
 * Kick off the background fold when its inputs changed or its result aged out.
 * Never awaited by the list route.
 * @param ctx - Host context.
 * @param state - plugin state.
 * @param summaries - Session rows.
 * @returns the in-flight promise, or `undefined` when no fold is needed.
 */
function ensurePresentFold(ctx, state, summaries) {
  if (state.signal.aborted) return undefined
  const query = ctx.get('sessionQuery')
  if (query === undefined || typeof query.listEvents !== 'function') return undefined
  const options = state.options
  const candidates = foldCandidates(summaries, options)
  const signature = foldSignature(candidates)
  const now = Date.now()
  const fresh =
    state.present.status === 'ready' &&
    state.present.signature === signature &&
    now - state.present.builtAt < PRESENT_TTL_MS
  if (fresh) return undefined
  // A changed signature is common while the current Session is being written;
  // folding at most once per interval keeps the Host responsive.
  if (state.present.status === 'ready' && now - state.present.builtAt < PRESENT_MIN_INTERVAL_MS) return undefined
  if (state.present.running !== null && state.present.signature === signature) return state.present.running

  const generation = state.present.generation + 1
  state.present.generation = generation
  state.present.signature = signature
  state.present.status = 'building'
  state.present.running = (async () => {
    try {
      const items = await foldPresent(ctx, state, query, candidates)
      if (state.signal.aborted || state.present.generation !== generation) return
      state.present.items = items
      state.present.status = 'ready'
      state.present.builtAt = Date.now()
      state.present.error = null
    } catch (error) {
      if (state.signal.aborted || state.present.generation !== generation) return
      state.present.status = 'ready'
      state.present.error = error instanceof Error ? error.message : String(error)
      state.present.builtAt = Date.now()
    } finally {
      if (state.present.generation === generation) state.present.running = null
    }
  })()
  return state.present.running
}

/**
 * Fold `deliverables/presented` out of the candidate Sessions, one Session at a
 * time with a macrotask yield between them so the Host event loop keeps serving
 * the page while a cold fold parses tens of megabytes of log.
 * @param ctx - Host context.
 * @param state - plugin state.
 * @param query - sessionQuery service.
 * @param candidates - Sessions to read.
 * @returns declared items that still exist on disk.
 */
async function foldPresent(ctx, state, query, candidates) {
  const items = []
  for (const summary of candidates) {
    if (state.signal.aborted) break
    const folded = await presentOfSession(state, query, summary)
    items.push(...folded)
    // Yield so an ongoing conversation keeps its RPC latency.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  items.sort((left, right) => (right.presentedAt ?? 0) - (left.presentedAt ?? 0))
  await attachSessionTitles(ctx, state, items)
  return items
}

/**
 * Read one Session's declared deliverables, memoized by `updatedAt`.
 * @param state - plugin state.
 * @param query - sessionQuery service.
 * @param summary - one Session row.
 * @returns declared items; unreadable Sessions contribute nothing.
 */
async function presentOfSession(state, query, summary) {
  const memo = state.sessions.get(summary.sessionId)
  if (memo !== undefined && memo.updatedAt === summary.updatedAt) return memo.items
  const items = []
  try {
    const records = await query.listEvents(summary.sessionId)
    const hits = (Array.isArray(records) ? records : []).filter(
      (record) => record?.type === 'deliverables/presented' && Number.isSafeInteger(record.seq),
    )
    for (const hit of hits) {
      const window = await query.readEvent(
        { sessionId: summary.sessionId, seq: hit.seq, before: 0, after: 0 },
        state.signal,
      )
      const data = window?.target?.data
      if (data === undefined || data === null || !Array.isArray(data.files)) continue
      const cwd =
        typeof window?.session?.cwd === 'string' && window.session.cwd.length > 0 ? window.session.cwd : summary.cwd
      const presentedAt = Number.isFinite(window?.target?.time) ? window.target.time : 0
      for (const file of data.files) {
        if (file === null || typeof file !== 'object') continue
        const declared = typeof file.path === 'string' ? file.path.trim() : ''
        if (declared.length === 0) continue
        const originalPath = toAbsolutePath(declared, cwd)
        if (!isAbsolutePath(originalPath)) continue
        let path = followAlias(state.aliases, originalPath)
        let info = await fileInfo(path)
        if (info === null && path !== originalPath) { path = originalPath; info = await fileInfo(path) }
        if (info === null) continue
        items.push({
          path,
          originalPath,
          name: basenameOf(path),
          kind: kindOfPath(path, state.options.extensions) ?? 'other',
          bytes: info.size,
          mtime: info.mtime,
          origin: 'present',
          description: typeof file.description === 'string' ? file.description : undefined,
          sessionId: summary.sessionId,
          presentedAt,
        })
      }
    }
  } catch {
    // A Session whose log is migrating, archived, or unreadable simply has no
    // declared deliverables to report.
  }
  state.sessions.set(summary.sessionId, { updatedAt: summary.updatedAt, items })
  return items
}

/**
 * Attach the Session title to declared items so the row can say where it came
 * from. Titles are memoized and refreshed slowly; a rename only changes the
 * label, never the list contents.
 * @param ctx - Host context.
 * @param state - plugin state.
 * @param items - declared items (mutated in place).
 */
async function attachSessionTitles(ctx, state, items) {
  if (items.length === 0) return
  const query = ctx.get('sessionQuery')
  if (query === undefined || typeof query.readTitleSnapshots !== 'function') return
  const now = Date.now()
  const ids = [...new Set(items.map((item) => item.sessionId).filter((id) => typeof id === 'string'))]
  const stale = ids.filter((id) => {
    const memo = state.titles.get(id)
    return memo === undefined || now - memo.at > TITLE_TTL_MS
  })
  if (stale.length > 0) {
    try {
      const results = await query.readTitleSnapshots(stale, state.signal)
      for (const result of Array.isArray(results) ? results : []) {
        if (typeof result?.sessionId !== 'string') continue
        const title = result.status === 'fulfilled' ? result.value?.title?.title : undefined
        state.titles.set(result.sessionId, { at: Date.now(), title: typeof title === 'string' ? title : '' })
      }
    } catch {
      // Titles are decoration; a failure leaves the label off.
    }
  }
  for (const item of items) {
    const memo = typeof item.sessionId === 'string' ? state.titles.get(item.sessionId) : undefined
    if (memo !== undefined && memo.title.length > 0) item.sessionTitle = memo.title
  }
  if (state.titles.size > TITLE_CACHE_LIMIT) {
    for (const key of state.titles.keys()) {
      if (state.titles.size <= TITLE_CACHE_LIMIT) break
      state.titles.delete(key)
    }
  }
}

// ---------------------------------------------------------------------------
// Filesystem-sourced files
// ---------------------------------------------------------------------------

/**
 * Every directory worth scanning: registered workspaces first (so the row shows
 * the workspace title), then the default directory, working directories of
 * recent Sessions, and any configured extras.
 * @param ctx - Host context.
 * @param summaries - Session rows.
 * @param options - normalized options.
 * @returns ordered roots with display labels.
 */
function resolveRoots(ctx, summaries, options) {
  const roots = new Map()
  const ignored = options.ignoreRoots.map((value) => withoutTrailingSeparators(toAbsolutePath(value, '')))
  const add = (value, label) => {
    if (typeof value !== 'string' || value.trim().length === 0) return
    const path = withoutTrailingSeparators(value.trim())
    if (!isAbsolutePath(path)) return
    if (ignored.some((blocked) => blocked.length > 0 && (path === blocked || isPathInside(blocked, path)))) return
    if (roots.has(path)) {
      const current = roots.get(path)
      if (current.autoLabel && typeof label === 'string' && label.trim().length > 0) {
        current.label = label.trim()
        current.autoLabel = false
      }
      return
    }
    const named = typeof label === 'string' && label.trim().length > 0
    roots.set(path, { path, label: named ? label.trim() : basenameOf(path), autoLabel: !named })
  }

  const registry = ctx.get('workspaceRegistry')
  if (registry !== undefined && typeof registry.list === 'function') {
    try {
      for (const workspace of registry.list()) add(workspace?.path, workspace?.title)
    } catch {
      // An unavailable registry simply contributes no titled roots.
    }
  }
  const working = ctx.get('workingDirectory')
  if (working !== undefined && typeof working.defaultDirectory === 'string') add(working.defaultDirectory, '')
  for (const summary of (options.maxSessions > 0 ? summaries.slice(0, options.maxSessions) : summaries)) add(summary.cwd, '')
  for (const extra of options.extraRoots) add(extra, '')
  return [...roots.values()].map(({ path, label }) => ({ path, label }))
}

/**
 * Bounded, read-only breadth-first walk of every root.
 * @param state - plugin state.
 * @param roots - resolved roots.
 * @returns recent deliverable files, one per path.
 */
async function scanRoots(state, roots) {
  const options = state.options
  const now = Date.now()
  const rootsKey = roots.map((root) => root.path).join('\n')
  if (state.files.at > 0 && now - state.files.at < options.cacheMs && state.files.rootsKey === rootsKey) {
    return state.files.items
  }

  const items = []
  let visited = 0
  let truncated = false
  const budget = options.maxScanFiles > 0 ? options.maxScanFiles : Infinity
  const perRoot = Math.max(MIN_ROOT_BUDGET, Math.ceil(budget / Math.max(roots.length, 1)))

  for (const root of roots) {
    if (visited >= budget) {
      truncated = true
      break
    }
    const share = Math.min(perRoot, budget - visited)
    let used = 0
    await walkRoot(root, options.scanDepth, options.extensions, {
      exhausted: () => used >= share || state.signal.aborted,
      tick: () => {
        used += 1
        visited += 1
      },
      push: (item) => items.push(item),
    })
    if (used >= share) truncated = true
  }

  state.files = { at: Date.now(), rootsKey, items, visited, truncated }
  return items
}

/**
 * Walk one root breadth-first, collecting extension-matched regular files.
 * @param root - root descriptor.
 * @param maxDepth - directory depth limit.
 * @param extensions - allowlisted extensions.
 * @param sink - budget and collection callbacks.
 */
async function walkRoot(root, maxDepth, extensions, sink) {
  let canonicalRoot
  try { canonicalRoot = await realpath(root.path) } catch { return }
  let frontier = [{ dir: root.path, depth: 0 }]
  while (frontier.length > 0) {
    const next = []
    for (const node of frontier) {
      if (sink.exhausted()) return
      let entries
      try {
        entries = await readdir(node.dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (sink.exhausted()) return
        sink.tick()
        const entryName = entry.name
        if (entry.isDirectory()) {
          if (!isSkippedDirName(entryName) && node.depth < maxDepth) {
            next.push({ dir: join(node.dir, entryName), depth: node.depth + 1 })
          }
          continue
        }
        if (isJunkFileName(entryName)) continue
        if (!entry.isFile() && !entry.isSymbolicLink()) continue
        const kind = kindOfPath(entryName, extensions)
        if (kind === null) continue
        const path = join(node.dir, entryName)
        // Scanning a symlink must not silently grant access outside this root.
        let target
        try { target = await realpath(path) } catch { continue }
        if (!isPathInside(canonicalRoot, target)) continue
        const info = await fileInfo(path)
        if (info === null) continue
        sink.push({
          path,
          name: entryName,
          kind,
          bytes: info.size,
          mtime: info.mtime,
          origin: 'file',
          rootLabel: root.label,
        })
      }
    }
    frontier = next
  }
}

/** Follow one path and return `{size, mtime}` for a regular file, or `null`. */
async function fileInfo(path) {
  try {
    const info = await stat(path)
    if (!info.isFile()) return null
    return { size: info.size, mtime: Math.round(info.mtimeMs) }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// File + open routes
// ---------------------------------------------------------------------------

/**
 * Whether one path may be streamed or opened. A path qualifies when this Host
 * listed it (the `servable` set rebuilt on every collection) or when it lives
 * inside a known workspace root, which keeps the routes from becoming an
 * arbitrary local file reader.
 * @param ctx - Host context.
 * @param state - plugin state.
 * @param path - requested absolute path.
 * @returns whether the path is servable.
 */
async function isKnownPath(ctx, state, path) {
  // Callers supply a realpath, so neither dot segments nor symlink aliases
  // can pass a lexical prefix check before escaping the workspace.
  if (state.servable.has(path)) return true
  const roots = resolveRoots(ctx, [], state.options)
  for (const root of roots) {
    try {
      if (isPathInside(await realpath(root.path), path)) return true
    } catch { /* a missing workspace grants no access */ }
  }
  return false
}

/**
 * Stream one listed file with a media type the browser can display inline.
 * @param ctx - Host context.
 * @param state - plugin state.
 * @param request - owned request.
 * @returns the file response.
 */
async function fileResponse(ctx, state, request) {
  const url = new URL(request.url)
  const requested = (url.searchParams.get('path') ?? '').trim()
  if (!isAbsolutePath(requested)) return json({ error: 'bad-path' }, 400)
  let target
  try {
    target = await realpath(requested)
  } catch {
    return json({ error: 'not-found' }, 404)
  }
  if (!(await isKnownPath(ctx, state, target))) return json({ error: 'forbidden' }, 403)
  const info = await fileInfo(target)
  if (info === null) return json({ error: 'not-found' }, 404)

  const media = mediaOfPath(target)
  const headers = {
    'content-type': media.mime,
    'content-length': String(info.size),
    'content-disposition': `${media.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeFileName(basenameOf(target))}`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  }
  if (media.kind === 'web' || media.ext === 'svg' || media.ext === 'xhtml') {
    // A generated HTML page is opened in an opaque origin: scripts may run so
    // charts work, but the document cannot touch the Harness page.
    headers['content-security-policy'] =
      "sandbox allow-scripts allow-popups allow-forms allow-modals; default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline'; font-src data:; media-src data: blob: https:; script-src 'unsafe-inline' https:"
  }
  return new Response(Readable.toWeb(createReadStream(target)), { status: 200, headers })
}

/** RFC 5987 filename encoding for `content-disposition`. */
function encodeFileName(value) {
  return encodeURIComponent(value).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

/**
 * Open one listed path with the Host desktop's default application, or reveal
 * it in the platform file manager.
 * @param ctx - Host context.
 * @param state - plugin state.
 * @param request - owned request.
 * @returns 204 on success, a JSON failure otherwise.
 */
async function openResponse(ctx, state, request) {
  const url = new URL(request.url)
  const requested = (url.searchParams.get('path') ?? '').trim()
  const action = url.searchParams.get('action') === 'reveal' ? 'reveal' : 'open'
  if (!isAbsolutePath(requested)) return json({ error: 'bad-path' }, 400)
  let target
  try { target = await realpath(requested) } catch { return json({ error: 'not-found' }, 404) }
  if (!(await isKnownPath(ctx, state, target))) return json({ error: 'forbidden' }, 403)

  const controller = ctx.get('sessionController')
  if (controller === undefined || typeof controller.openWorkspacePath !== 'function') {
    return json({ error: 'desktop-unavailable' }, 409)
  }
  const desktop = typeof controller.workspaceDesktop === 'function' ? controller.workspaceDesktop() : undefined
  if (desktop?.available !== true) return json({ error: 'desktop-unavailable' }, 409)

  try {
    await controller.openWorkspacePath({ path: target, ...(action === 'reveal' ? { action } : {}) }, request.signal)
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: 'open-failed', message }, 502)
  }
}


function identityOf(link, target) {
  return [link.dev, link.ino, link.size, link.mtimeMs, link.ctimeMs, link.mode,
    target.dev, target.ino, target.size, target.mtimeMs, target.ctimeMs].join(':')
}

async function fileRecord(path) {
  const link = await lstat(path)
  if (!link.isFile() && !link.isSymbolicLink()) return undefined
  const canonical = await realpath(path)
  const target = await stat(canonical)
  if (!target.isFile()) return undefined
  return { canonical, entryIdentity: entryKey(link), identity: identityOf(link, target), bytes: target.size, mtime: Math.round(target.mtimeMs) }
}

/** Eight workers keep unbounded lists from opening thousands of files at once. */
async function collectLiveFiles(candidates, roots, previousTickets) {
  const result = new Array(candidates.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(8, candidates.length) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= candidates.length) return
      const item = candidates[index]
      try {
        const record = await fileRecord(item.path)
        if (!record || (item.origin !== 'present' && !roots.some((root) => isPathInside(root, record.canonical)))) continue
        const previous = previousTickets.get(item.path)
        const token = previous?.canonical === record.canonical && previous.identity === record.identity
          ? previous.token : randomUUID()
        result[index] = { ...item, ...record, deleteToken: token,
          ticket: { ...record, token, item: publicItem({ ...item, ...record, deleteToken: token }) } }
      } catch { /* a missing or unreadable file is no longer a current deliverable */ }
    }
  }))
  return result.filter(Boolean)
}

/** Move exactly one displayed, unchanged regular file (or its link) to OS trash. */
async function deleteResponse(state, request, trashFile) {
  if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405)
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'json-required' }, 415)
  }
  let body
  try {
    const text = await request.text()
    if (text.length > 16384) return json({ error: 'body-too-large' }, 413)
    body = JSON.parse(text)
  } catch { return json({ error: 'bad-json' }, 400) }
  const path = typeof body?.path === 'string' ? body.path : ''
  const ticket = state.deleteTickets.get(path)
  if (!ticket || typeof body.token !== 'string' || body.token !== ticket.token) {
    return json({ error: 'not-listed' }, 403)
  }
  if (state.deleting.has(path)) return json({ error: 'delete-busy' }, 409)
  state.deleting.add(path)
  try {
    let current
    try { current = await fileRecord(path) } catch { return json({ error: 'not-found' }, 404) }
    if (!current || current.canonical !== ticket.canonical || current.identity !== ticket.identity) {
      return json({ error: 'file-changed' }, 409)
    }
    // Do not expand glob characters, follow the link, or fall back to hard deletion.
    await trashFile(path, { glob: false })
    forgetRemoved(state, path, ticket.canonical)
    invalidateFiles(state)
    return json({ deleted: true, path, recoverable: true })
  } catch (error) {
    return json({ error: 'trash-failed', message: error instanceof Error ? error.message : String(error) }, 502)
  } finally {
    state.deleting.delete(path)
  }
}


function invalidateFiles(state) {
  state.revision += 1
  state.list = { at: 0, value: null }
  state.files.at = 0
  state.present.builtAt = 0
  state.present.signature = ''
  state.present.generation += 1
}

function forgetRemoved(state, path, canonical) {
  state.deleteTickets.delete(path)
  state.servable.delete(canonical)
  state.present.items = state.present.items.filter((item) => item.path !== path)
}

async function jsonBody(request, maxLength = 262144) {
  if (request.method !== 'POST') return { failure: json({ error: 'method-not-allowed' }, 405) }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return { failure: json({ error: 'json-required' }, 415) }
  }
  try {
    const text = await request.text()
    if (text.length > maxLength) return { failure: json({ error: 'body-too-large' }, 413) }
    return { body: JSON.parse(text) }
  } catch { return { failure: json({ error: 'bad-json' }, 400) } }
}

async function batchDeleteResponse(state, request, trashFile) {
  const { body, failure } = await jsonBody(request)
  if (failure) return failure
  if (!Array.isArray(body?.files) || body.files.length === 0 || body.files.length > 200) {
    return json({ error: 'bad-batch' }, 400)
  }
  const results = [], ready = [], seen = new Set()
  for (const file of body.files) {
    const path = typeof file?.path === 'string' ? file.path : ''
    if (seen.has(path)) continue
    seen.add(path)
    const ticket = state.deleteTickets.get(path)
    if (!ticket || typeof file.token !== 'string' || file.token !== ticket.token) {
      results.push({ path, deleted: false, status: 403, error: 'not-listed' }); continue
    }
    if (state.deleting.has(path)) { results.push({ path, deleted: false, status: 409, error: 'delete-busy' }); continue }
    state.deleting.add(path)
    try {
      const current = await fileRecord(path)
      if (!current || current.canonical !== ticket.canonical || current.identity !== ticket.identity) {
        state.deleting.delete(path)
        results.push({ path, deleted: false, status: 409, error: 'file-changed' }); continue
      }
      ready.push({ path, ticket })
    } catch {
      state.deleting.delete(path)
      results.push({ path, deleted: false, status: 404, error: 'not-found' })
    }
  }
  let trashError
  try {
    if (ready.length) await trashFile(ready.map((file) => file.path), { glob: false })
  } catch (error) { trashError = error instanceof Error ? error.message : String(error) }
  for (const { path, ticket } of ready) {
    try {
      let gone = false
      try { await lstat(path) } catch (error) { if (error.code === 'ENOENT') gone = true; else throw error }
      if (gone) {
        forgetRemoved(state, path, ticket.canonical)
        results.push({ path, deleted: true, status: 200, recoverable: true })
      } else results.push({ path, deleted: false, status: 502, error: 'trash-failed', message: trashError || 'File remains at its original path' })
    } catch (error) {
      results.push({ path, deleted: false, status: 502, error: 'trash-failed', message: error.message })
    } finally { state.deleting.delete(path) }
  }
  if (results.some((item) => item.deleted)) invalidateFiles(state)
  return json({ results, deleted: results.filter((item) => item.deleted).length })
}

async function renameResponse(state, request) {
  const { body, failure } = await jsonBody(request, 16384)
  if (failure) return failure
  const path = typeof body?.path === 'string' ? body.path : ''
  const ticket = state.deleteTickets.get(path)
  if (!ticket || typeof body.token !== 'string' || body.token !== ticket.token) return json({ error: 'not-listed' }, 403)
  if (!validFileName(body.name)) return json({ error: 'bad-name' }, 400)
  const target = join(dirname(path), body.name)
  if (target === path) return json({ renamed: true, path, item: ticket.item })
  if (state.deleting.has(path)) return json({ error: 'file-busy' }, 409)
  state.deleting.add(path)
  const previous = state.renameQueue
  let release
  state.renameQueue = new Promise((resolve) => { release = resolve })
  await previous
  let prepared
  let aliasesSaved = false
  let oldAliases
  try {
    await state.aliasesReady
    oldAliases = state.aliases
    if (state.aliasError) return json({ error: 'rename-storage', message: state.aliasError }, 503)
    const current = await fileRecord(path)
    if (!current || current.canonical !== ticket.canonical || current.identity !== ticket.identity) {
      return json({ error: 'file-changed' }, 409)
    }
    state.pendingNames.add(target)
    prepared = await prepareRename(path, target, ticket.entryIdentity)
    const nextAliases = new Map(state.aliases)
    for (const [source] of nextAliases) {
      if (followAlias(state.aliases, source) === path) nextAliases.set(source, target)
    }
    nextAliases.delete(target)
    nextAliases.set(path, target)
    await saveAliases(state.aliasFile, nextAliases)
    aliasesSaved = true
    await prepared.commit()
    prepared = null
    state.aliases = nextAliases
    forgetRemoved(state, path, ticket.canonical)
    const record = await fileRecord(target)
    const token = randomUUID()
    const item = publicItem({ ...ticket.item, ...record, path: target, name: body.name,
      kind: kindOfPath(target, state.options.extensions) ?? 'other', deleteToken: token })
    state.deleteTickets.set(target, { ...record, token, item })
    state.servable.add(record.canonical)
    invalidateFiles(state)
    return json({ renamed: true, oldPath: path, path: target, item })
  } catch (error) {
    if (prepared) {
      await prepared.rollback().catch(() => {})
      if (aliasesSaved) await saveAliases(state.aliasFile, oldAliases).catch(() => {})
    }
    const status = error.code === 'EEXIST' ? 409 : error.code === 'FILE_CHANGED' ? 409 : error.code === 'ENOENT' ? 404 : 502
    return json({ error: error.code === 'EEXIST' ? 'name-exists' : error.code === 'FILE_CHANGED' ? 'file-changed' : 'rename-failed', message: error.message }, status)
  } finally {
    state.pendingNames.delete(target)
    state.deleting.delete(path)
    release()
  }
}
