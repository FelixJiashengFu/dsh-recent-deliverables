/**
 * Recent Deliverables — Host half.
 *
 * Owns three authenticated Fetch routes inside Connection's authentication
 * fence:
 *
 *   GET  /api/recent-deliverables.list   the merged, newest-first deliverable list
 *   GET  /api/recent-deliverables.file   one listed file's bytes (inline preview)
 *   POST /api/recent-deliverables.open   open / reveal one listed path on the desktop
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
 * Session log is ever written; this module only reads.
 * @module dsh-recent-deliverables
 */
import { createReadStream } from 'node:fs'
import { readdir, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
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

/** Connection supplies the authenticated Fetch registry used by all three routes. */
export const inject = ['connection']

const LIST_PATH = '/api/recent-deliverables.list'
const FILE_PATH = '/api/recent-deliverables.file'
const OPEN_PATH = '/api/recent-deliverables.open'

/** How many Session fold results are memoized before the oldest entry is dropped. */
const SESSION_CACHE_LIMIT = 96
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
export function apply(ctx, config) {
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
  }

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
  const cached = state.list.value
  if (cached !== null && Date.now() - state.list.at < state.options.cacheMs) return json(cached)
  if (state.building !== null) {
    const shared = await state.building
    return json(shared.value)
  }
  state.building = buildList(ctx, state)
  try {
    const built = await state.building
    if (built.cache) state.list = { at: Date.now(), value: built.value }
    return json(built.value)
  } catch (error) {
    if (state.list.value !== null) return json(state.list.value)
    throw error
  } finally {
    state.building = null
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
  const started = Date.now()
  const options = state.options
  const summaries = await loadSessionSummaries(ctx, state)
  const roots = resolveRoots(ctx, summaries, options)

  // Start (or reuse) the background declared-deliverable fold. Items folded
  // from an earlier Session state stay visible while a refresh is in flight;
  // the scan below is awaited first so a fold that lands during it is included.
  const fold = options.includePresent ? ensurePresentFold(ctx, state, summaries) : undefined
  const files = options.includeFiles ? await scanRoots(state, roots) : []
  const declared = state.present.items
  const merged = mergeDeliverables(declared, files, options.maxItems, options.declaredSlots)
  const items = merged.items.map(publicItem).filter(Boolean)
  const pending = fold !== undefined && state.present.status !== 'ready'

  // Only paths this Host actually listed may be streamed or opened by the
  // browser; the Set is rebuilt on every collection.
  state.servable = new Set(merged.items.map((item) => withoutTrailingSeparators(item.path)))

  return {
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
  return summaries
    .filter((summary) => !summary.blank && summary.updatedAt >= cutoff)
    .slice(0, options.maxSessions)
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
  if (options.maxSessions === 0) return undefined
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
        const path = toAbsolutePath(declared, cwd)
        if (!isAbsolutePath(path)) continue
        const info = await fileInfo(path)
        if (info === null) continue
        items.push({
          path,
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
  if (state.sessions.size > SESSION_CACHE_LIMIT) {
    for (const key of state.sessions.keys()) {
      if (state.sessions.size <= SESSION_CACHE_LIMIT) break
      state.sessions.delete(key)
    }
  }
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
  for (const summary of summaries.slice(0, Math.max(options.maxSessions, 1))) add(summary.cwd, '')
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
  const perRoot = Math.max(MIN_ROOT_BUDGET, Math.ceil(options.maxScanFiles / Math.max(roots.length, 1)))

  for (const root of roots) {
    if (visited >= options.maxScanFiles) {
      truncated = true
      break
    }
    const share = Math.min(perRoot, options.maxScanFiles - visited)
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
  const normalized = withoutTrailingSeparators(path)
  if (state.servable.has(normalized)) return true
  const roots = resolveRoots(ctx, [], state.options)
  return roots.some((root) => isPathInside(root.path, normalized))
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
  if (!(await isKnownPath(ctx, state, requested))) return json({ error: 'forbidden' }, 403)

  let target
  try {
    target = await realpath(requested)
  } catch {
    return json({ error: 'not-found' }, 404)
  }
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
  if (!(await isKnownPath(ctx, state, requested))) return json({ error: 'forbidden' }, 403)

  const controller = ctx.get('sessionController')
  if (controller === undefined || typeof controller.openWorkspacePath !== 'function') {
    return json({ error: 'desktop-unavailable' }, 409)
  }
  const desktop = typeof controller.workspaceDesktop === 'function' ? controller.workspaceDesktop() : undefined
  if (desktop?.available !== true) return json({ error: 'desktop-unavailable' }, 409)

  try {
    await controller.openWorkspacePath({ path: requested, ...(action === 'reveal' ? { action } : {}) }, request.signal)
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: 'open-failed', message }, 502)
  }
}
