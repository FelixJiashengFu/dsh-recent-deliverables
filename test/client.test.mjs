/**
 * Wiring + helper checks for the Recent Deliverables browser half.
 *
 * `client.js` is a module-loader bundle, not an ES module: it registers a
 * factory on `window.__ModuleLoader__`. This harness therefore materializes the
 * factory with a stubbed module table and a stubbed Context, then checks the
 * two things that can break silently without a browser:
 *
 *   1. `apply()` accepts the Context shape it is given (effects, injects, slot
 *      registration) and registers the panel exactly once into `shell.overlay`.
 *   2. The forward helpers turn the IM Assistant payload into targets and build
 *      a prompt whose embedded JSON is valid for a path with spaces.
 *
 * Run with: `node test/client.test.mjs`.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

let passed = 0
let failed = 0
const cases = []
function test(name, fn) { cases.push({ name, fn }) }

/** Slice one `function name(...) { ... }` block by counting braces. */
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `missing function ${name}`)
  let depth = 0
  for (let at = source.indexOf('{', start); at < source.length; at += 1) {
    const character = source[at]
    if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, at + 1)
    }
  }
  throw new Error(`unbalanced function ${name}`)
}

/** Slice one `const NAME = ...;` declaration up to the end of the line. */
function extractConst(name) {
  const start = source.indexOf(`const ${name} = `)
  assert.notEqual(start, -1, `missing const ${name}`)
  const end = source.indexOf('\n', start)
  return source.slice(start, end === -1 ? source.length : end)
}

// ---------------------------------------------------------------------------
// 1. Forward helpers, evaluated exactly as written in client.js
// ---------------------------------------------------------------------------

const helpers = new Function(
  `let activeLanguage = 'zh'\n${extractConst('PLATFORM_IDS')}\n${extractFunction('collectForwardTargets')}\n${extractFunction('forwardPrompt')}\nreturn { collectForwardTargets, forwardPrompt }`,
)()

test('collectForwardTargets keeps chats and tags their assistant state', () => {
  const payload = {
    ok: true,
    channels: [
      { id: 'weixin', accounts: [{ id: 'weixin_abc', name: '微信账号 1', connected: true, status: '已连接' }] },
      { id: 'feishu', accounts: [{ id: 'feishu_def', name: '飞书账号 1', connected: false, status: '连接失败' }] },
    ],
    groups: [
      {
        id: 'weixin',
        label: '微信',
        sessions: [
          {
            sessionId: 'im:weixin_abc:dm:1:o9cq',
            channel: 'weixin_abc',
            kind: 'dm',
            title: '在么',
            muted: false,
            detached: false,
            updatedAt: '2026-10-23T20:30:00.000Z',
          },
          { sessionId: 'im:weixin_abc:group:2:room', channel: 'weixin_abc', kind: 'group', title: '家人群', muted: true },
          { sessionId: 'im:weixin_gone:dm:3:old', channel: 'weixin_gone', kind: 'dm', title: '旧聊天', updatedAt: '2026-10-01T10:00:00.000Z' },
        ],
      },
      {
        id: 'feishu',
        label: '飞书',
        sessions: [
          { sessionId: 'im:feishu_def:dm:4:oc_x', channel: 'feishu_def', kind: 'dm', title: ' 飞书私聊 ', detached: false, updatedAt: '2026-10-22T10:00:00.000Z' },
          { sessionId: 'im:feishu_def:dm:5:oc_y', channel: 'feishu_def', kind: 'dm', title: 'detached', detached: true, updatedAt: '2026-10-01T10:00:00.000Z' },
        ],
      },
      { id: 'not-a-platform', sessions: [{ sessionId: 'im:x:dm:1:2', kind: 'dm' }] },
    ],
  }
  const targets = helpers.collectForwardTargets(payload)
  assert.deepEqual(
    targets.map((target) => target.sessionId),
    ['im:weixin_abc:dm:1:o9cq', 'im:feishu_def:dm:4:oc_x', 'im:weixin_gone:dm:3:old'],
  )
  assert.equal(targets[0].accountState, 'connected')
  assert.equal(targets[0].title, '在么')
  assert.equal(targets[1].accountState, 'offline', 'configured but not connected')
  assert.equal(targets[1].title, '飞书私聊', 'titles are trimmed')
  assert.equal(targets[2].accountState, 'missing', 'a chat whose assistant was removed')
  assert.ok(targets[0].updatedAt > targets[1].updatedAt)

  const withoutChannel = helpers.collectForwardTargets({
    groups: [{ id: 'slack', sessions: [{ sessionId: 'im:s:dm:1:2', kind: 'dm', title: 'x' }] }],
  })
  assert.equal(withoutChannel[0].accountState, 'unknown', 'payloads without a channel stay usable')
  assert.deepEqual(helpers.collectForwardTargets(undefined), [])
  assert.deepEqual(helpers.collectForwardTargets({ ok: false }), [])
})

test('forwardPrompt embeds a JSON argument that parses for a spaced path', () => {
  const path = '/Volumes/大盘盘是我哒/Happy/thermo6/problem 6.pdf'
  const prompt = helpers.forwardPrompt(path)
  assert.ok(prompt.includes('present'), 'the prompt names the present tool')
  const json = prompt.match(/\{"files":\[\{.*?\}\]\}/s)?.[0]
  assert.ok(json !== undefined && json.length > 0, 'the prompt embeds a JSON argument')
  assert.deepEqual(JSON.parse(json).files, [{ path, description: '转发成品' }])
})

test('dragExcluded lets the pill drag itself but not header controls', () => {
  const dragExcluded = new Function(`${extractFunction('dragExcluded')}\nreturn dragExcluded`)()
  const header = { id: 'header' }
  const pill = { id: 'pill' }
  const button = { id: 'button' }
  const targetOf = (closestResult) => ({ closest: () => closestResult })
  // A press on the pill itself: closest() returns the handle, so it drags.
  assert.equal(dragExcluded(targetOf(pill), pill), false)
  // A press on a header control: that button is not the handle, so it clicks.
  assert.equal(dragExcluded(targetOf(button), header), true)
  // A press on plain header text drags.
  assert.equal(dragExcluded(targetOf(null), header), false)
  // Degenerate inputs never throw.
  assert.equal(dragExcluded(targetOf(null), null), true)
  assert.equal(dragExcluded({}, header), false)
})

test('dragAnchor translates pointer movement into the top-right anchor', () => {
  const dragAnchor = new Function(`${extractFunction('dragAnchor')}\nreturn dragAnchor`)()
  assert.deepEqual(dragAnchor({ right: 16, top: 68 }, 0, 0), { right: 16, top: 68 })
  assert.deepEqual(dragAnchor({ right: 16, top: 68 }, 100, 50), { right: -84, top: 118 })
  assert.deepEqual(dragAnchor({ right: 200, top: 500 }, -120, -40), { right: 320, top: 460 })
})

test('clampPanelPosition keeps the top-right anchor on screen', () => {
  const clamp = new Function(`${extractFunction('clampPanelPosition')}\nreturn clampPanelPosition`)()
  const viewport = { width: 1200, height: 900 }
  assert.deepEqual(clamp({ right: 16, top: 68 }, 336, 500, viewport), { right: 16, top: 68 })
  assert.deepEqual(clamp({ right: -50, top: -20 }, 336, 500, viewport), { right: 8, top: 8 })
  assert.deepEqual(clamp({ right: 5000, top: 5000 }, 336, 500, viewport), { right: 856, top: 392 })
  assert.deepEqual(clamp({ right: 300, top: 10 }, 2000, 100, viewport), { right: 8, top: 10 })
})

// ---------------------------------------------------------------------------
// 2. Factory wiring: slot registration with a stubbed React and Context
// ---------------------------------------------------------------------------

function materialize(options = {}) {
  let registration = null
  const injected = []
  const effects = []
  const remoteSession = options.remoteSession

  const reactStub = {
    createElement: () => null,
    Fragment: Symbol('Fragment'),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: (value) => ({ current: value }),
    useEffect: () => {},
    useMemo: (factory) => factory(),
  }

  const contextStub = {
    get: () => undefined,
    on: () => () => {},
    effect: (factory) => {
      effects.push(typeof factory === 'function' ? factory : null)
      return () => {}
    },
    inject: (dependencies, callback) => {
      injected.push(dependencies)
      const scope = {
        effect: (factory) => {
          effects.push(factory)
          return () => {}
        },
        ...(dependencies.includes('locale')
          ? {
              locale: {
                getSnapshot: () => ({ active: 'zh' }),
                subscribe: () => () => {},
                register: () => () => {},
                bind: () => (key) => key,
              },
            }
          : {}),
        ...(dependencies.includes('remote.session') && remoteSession !== undefined
          ? { 'remote.session': remoteSession }
          : {}),
      }
      callback(scope)
      return { dispose: () => {} }
    },
    slots: {
      inject: (key, callback) => {
        callback()
        return () => {}
      },
      register: (options, component) => {
        registration = { options, component }
        return () => {}
      },
    },
  }

  let factoryResult = null
  const loader = {
    load(entry) {
      assert.equal(entry.id, 'dsh-recent-deliverables')
      factoryResult = entry.factory((name) => {
        if (name === 'react') return reactStub
        throw new Error(`unexpected require(${name})`)
      })
    },
  }

  const windowStub = { __ModuleLoader__: loader, localStorage: { getItem: () => null, setItem: () => {} } }
  const fetchStub = () => Promise.reject(new Error('offline test'))
  const navigatorStub = { language: 'zh-CN', languages: ['zh-CN'], clipboard: { writeText: async () => {} } }
  const documentStub = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} }

  // Evaluate the bundle exactly as the browser module table would; the browser
  // globals are injected as parameters so this stays a pure wiring check.
  new Function('window', 'fetch', 'navigator', 'document', source)(windowStub, fetchStub, navigatorStub, documentStub)
  assert.ok(factoryResult !== null, 'factory ran')
  return { plugin: factoryResult, context: contextStub, injected, effects, registration: () => registration }
}

test('client factory exposes the plugin and registers one shell.overlay entry', () => {
  const harness = materialize()
  const plugin = harness.plugin
  const injected = harness.injected
  assert.deepEqual(plugin.inject, ['slots'])
  assert.equal(typeof plugin.apply, 'function')
  plugin.apply(harness.context)
  const registered = harness.registration()
  assert.ok(registered !== null, 'a slot registration happened')
  assert.equal(registered.options.name, 'shell.overlay')
  assert.equal(registered.options.id, 'recent-deliverables')
  assert.equal(typeof registered.component, 'function', 'the component is a function')
  // Optional Remote services are requested, never required by `inject`.
  const dependencies = injected.map((list) => list.join(','))
  assert.ok(dependencies.some((value) => value.includes('remote.session')), 'remote.session is requested optionally')
})

test('apply tolerates a missing or present remote.session namespace', () => {
  const withoutRemote = materialize()
  assert.doesNotThrow(() => withoutRemote.plugin.apply(withoutRemote.context))

  const withRemote = materialize({ remoteSession: { prompt: async () => ({ accepted: true }) } })
  assert.doesNotThrow(() => withRemote.plugin.apply(withRemote.context))
  assert.equal(withRemote.registration().options.id, 'recent-deliverables')
})

test('old preferences migrate without losing the filter or drag anchor', () => {
  const helpers = new Function(`${extractConst('KIND_FILTERS')}\n${extractFunction('normalizeAvatar')}\n${extractFunction('normalizeUiState')}\nreturn { normalizeUiState }`)()
  const old = helpers.normalizeUiState({ collapsed: true, filter: 'pdf', right: 20, top: 30 })
  assert.equal(old.collapsed, true)
  assert.equal(old.filter, 'pdf')
  assert.equal(old.right, 20)
  assert.equal(old.top, 30)
  assert.equal(old.size, null)
  assert.deepEqual(helpers.normalizeUiState({ size: { width: 480, height: 620 } }).size, { width: 480, height: 620 })
  for (const size of [{ width: -1, height: 400 }, { width: 400, height: Infinity }, { width: "400", height: 300 }]) assert.equal(helpers.normalizeUiState({ size }).size, null)
  assert.equal(old.language, 'auto')
  assert.equal(old.showTime, true)
  assert.equal(old.showClock, false)
  assert.equal(old.showWeather, false)
  assert.equal(helpers.normalizeUiState({ showClock: true, showWeather: true, showTime: false }).showClock, true)
  assert.equal(helpers.normalizeUiState({ showClock: true, showWeather: true, showTime: false }).showWeather, true)
  assert.equal(helpers.normalizeUiState({ showTime: false }).showTime, false)
  assert.deepEqual(old.avatar, { kind: 'default', value: '' })
  assert.equal(helpers.normalizeUiState({ language: 'zh' }).language, 'zh')
  assert.equal(helpers.normalizeUiState({ language: 'en' }).language, 'en')
  assert.equal(helpers.normalizeUiState({ language: 'invalid', filter: 'invalid' }).language, 'auto')
})

test('character preferences accept local images and emoji but reject external URLs and SVG', () => {
  const normalize = new Function(`${extractFunction('normalizeAvatar')}\nreturn normalizeAvatar`)()
  assert.deepEqual(normalize({ kind: 'emoji', value: '🐱' }), { kind: 'emoji', value: '🐱' })
  assert.equal(normalize({ kind: 'emoji', value: '  ' }).kind, 'default')
  assert.equal(normalize({ kind: 'image', value: 'data:image/png;base64,YQ==' }).kind, 'image')
  for (const value of ['https://example.com/image.png', 'data:image/svg+xml;base64,YQ==', 'javascript:alert(1)']) {
    assert.equal(normalize({ kind: 'image', value }).kind, 'default')
  }
  assert.equal(normalize({ kind: 'image', value: 'data:image/png;base64,' + 'a'.repeat(2800000) }).kind, 'default')
})

test('outside clicks exclude owned controls, previews, shadow paths and missing refs', () => {
  const outside = new Function(`${extractFunction('outsidePanel')}\nreturn outsidePanel`)()
  const inside = {}
  const external = {}
  const root = { contains: (target) => target === inside }
  assert.equal(outside({ target: inside }, root), false)
  assert.equal(outside({ target: external }, root), true)
  assert.equal(outside({ target: external, composedPath: () => [external, root] }, root), false)
  assert.equal(outside({ target: external }, null), false)
  assert.equal(outside({}, root), false)
})

test('explicit language selection wins over the host locale dictionary', () => {
  const dictionary = source.slice(source.indexOf('    const DICTIONARY = {'), source.indexOf('    // Runtime services and locale plumbing'))
  const create = new Function('mode', `${dictionary}\nconst NAME_SPACE = 'recent-deliverables'; let languageOverride = mode; let activeLanguage = mode === 'auto' ? 'zh' : mode; const localeService = { bind: () => () => 'host Chinese' };\n${extractFunction('t')}\nreturn t`)
  assert.equal(create('en')('title'), 'Deliverables')
  assert.equal(create('zh')('title'), '成品')
  assert.equal(create('auto')('title'), 'host Chinese')
  assert.equal(create('en')('footer.count', { n: 12 }), '12 files')
})

test('image selection rejects oversized and unsupported files before reading them', async () => {
  const image = new Function(`${extractConst('AVATAR_IMAGE_TYPES')}\n${extractConst('AVATAR_MAX_BYTES')}\n${extractFunction('normalizeAvatar')}\n${extractFunction('characterImage')}\nreturn characterImage`)()
  await assert.rejects(image({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }), /imageTooLarge/)
  await assert.rejects(image({ type: 'image/svg+xml', size: 10 }), /imageInvalid/)
  await assert.rejects(image(null), /imageInvalid/)
})

test('successful deletion updates counts immediately and ignores stale lists while allowing restored files', async () => {
  let respond
  const fakeFetch = () => new Promise((resolve) => { respond = resolve })
  const create = new Function('fetch', 'window', `${extractConst('LIST_URL')}\n${extractFunction('createStore')}\nreturn createStore`)(fakeFetch, { setTimeout, clearTimeout })
  const store = create()
  const a = { path: '/a.txt', deleteToken: 'old-ticket' }
  const b = { path: '/b.txt', deleteToken: 'b-ticket' }
  let pending = store.load()
  respond(Response.json({ items: [a, b], stats: { shown: 2 } }))
  await pending
  pending = store.load()
  store.remove(a.path, a.deleteToken)
  assert.equal(store.get().items.length, 1)
  assert.equal(store.get().stats.shown, 1)
  respond(Response.json({ items: [a, b], stats: { shown: 2 } }))
  await pending
  assert.deepEqual(store.get().items.map((item) => item.path), [b.path])
  pending = store.load()
  respond(Response.json({ items: [{ ...a, deleteToken: 'restored-ticket' }, b], stats: { shown: 2 } }))
  await pending
  assert.equal(store.get().items.length, 2)
  store.dispose()
})


test('sweep selection covers forward and backward ranges while keeping earlier choices', () => {
  const range = new Function(`${extractFunction('selectionRange')}\nreturn selectionRange`)()
  const paths = ['a', 'b', 'c', 'd', 'e']
  assert.deepEqual([...range(paths, 1, 3, new Set(['e']))], ['e', 'b', 'c', 'd'])
  assert.deepEqual([...range(paths, 3, 1, new Set())], ['b', 'c', 'd'])
  assert.deepEqual([...range(paths, 0, 99, new Set())], paths)
})

test('rename immediately replaces its item and suppresses an in-flight old path', async () => {
  let respond
  const create = new Function('fetch', 'window', `${extractConst('LIST_URL')}\n${extractFunction('createStore')}\nreturn createStore`)(() => new Promise((resolve) => { respond = resolve }), { setTimeout, clearTimeout })
  const store = create(), before = { path: '/a.txt', deleteToken: 'a' }, after = { path: '/b.txt', deleteToken: 'b' }
  let pending = store.load()
  respond(Response.json({ items: [before], stats: { shown: 1 } })); await pending
  pending = store.load()
  store.rename(before.path, before.deleteToken, after)
  assert.equal(store.get().items[0].path, '/b.txt')
  respond(Response.json({ items: [before], stats: { shown: 1 } })); await pending
  assert.equal(store.get().items.some((item) => item.path === before.path), false)
  assert.equal(store.get().items[0].path, after.path)
  assert.equal(store.get().stats.shown, 1)
  pending = store.load()
  respond(Response.json({ items: [after], stats: { shown: 1 } })); await pending
  assert.equal(store.get().items[0].path, after.path)
  store.dispose()
})

test('weather symbols distinguish day, night, rain, snow, storms and unknown data', () => {
  const symbol = new Function(`${extractFunction('weatherSymbol')}\nreturn weatherSymbol`)()
  assert.equal(symbol(0, true).emoji, '☀️')
  assert.equal(symbol(0, false).emoji, '🌙')
  assert.equal(symbol(61, true).key, 'rain')
  assert.equal(symbol(75, false).key, 'snow')
  assert.equal(symbol(97, true).key, 'thunder')
  assert.equal(symbol(null, true).key, 'unknown')
  assert.equal(symbol(999, true).emoji, '—')
})

test('preferred panel size is bounded by usable viewport and retains room for controls', () => {
  const fit = new Function(`${extractFunction('fitPanelSize')}\nreturn fitPanelSize`)()
  assert.deepEqual(fit({ width: 520, height: 640 }, { width: 1200, height: 900 }), { width: 520, height: 640 })
  assert.deepEqual(fit({ width: 20, height: 20 }, { width: 1200, height: 900 }), { width: 300, height: 280 })
  assert.deepEqual(fit({ width: 5000, height: 5000 }, { width: 1000, height: 700 }), { width: 984, height: 684 })
  assert.deepEqual(fit({ width: 520, height: 640 }, { width: 280, height: 240 }), { width: 264, height: 224 })
})

test('all four resize edges keep the opposite edge anchored', () => {
  const resize = new Function(`${extractFunction('fitPanelSize')}\n${extractFunction('resizedPanelRect')}\nreturn resizedPanelRect`)()
  const start = { left: 100, top: 80, width: 400, height: 400 }, viewport = { width: 1000, height: 800 }
  assert.deepEqual(resize(start, 'e', 120, 0, viewport), { left: 100, top: 80, right: 380, width: 520, height: 400 })
  assert.deepEqual(resize(start, 'w', -60, 0, viewport), { left: 40, top: 80, right: 500, width: 460, height: 400 })
  assert.deepEqual(resize(start, 'n', 0, -50, viewport), { left: 100, top: 30, right: 500, width: 400, height: 450 })
  assert.deepEqual(resize(start, 's', 0, 100, viewport), { left: 100, top: 80, right: 500, width: 400, height: 500 })
})

test('four resize corners combine axes and stop at minimum sizes or screen edges', () => {
  const resize = new Function(`${extractFunction('fitPanelSize')}\n${extractFunction('resizedPanelRect')}\nreturn resizedPanelRect`)()
  const start = { left: 100, top: 80, width: 400, height: 400 }, viewport = { width: 1000, height: 800 }
  assert.deepEqual(resize(start, 'nw', -100, -100, viewport), { left: 8, top: 8, right: 500, width: 492, height: 472 })
  assert.deepEqual(resize(start, 'ne', 200, -30, viewport), { left: 100, top: 50, right: 300, width: 600, height: 430 })
  assert.deepEqual(resize(start, 'sw', -40, 120, viewport), { left: 60, top: 80, right: 500, width: 440, height: 520 })
  assert.deepEqual(resize(start, 'se', 100, 50, viewport), { left: 100, top: 80, right: 400, width: 500, height: 450 })
  const small = resize(start, 'nw', 5000, 5000, viewport)
  assert.equal(small.width, 300); assert.equal(small.height, 280)
  const large = resize(start, 'se', 5000, 5000, viewport)
  assert.equal(large.right, 8); assert.equal(large.top + large.height, 792)
})

test('automatic categories keep new types and support explicit custom rules and overrides', () => {
  const helpers = new Function(`${extractConst('KIND_FILTERS')}\nconst t = (key) => key;\n${extractFunction('blankOrganizer')}\n${extractFunction('matchesCategory')}\n${extractFunction('categoryFilters')}\nreturn { categoryFilters, blankOrganizer, matchesCategory }`)()
  const prefs = helpers.blankOrganizer()
  prefs.categories.custom = [{ id: 'custom-papers', name: 'Final papers', extensions: ['pdf'], contains: 'final' }]
  prefs.categories.names = [{ id: 'pdf', label: 'Papers' }]
  prefs.categories.order = ['custom-papers', 'all', 'pdf']
  prefs.categories.hidden = ['image']
  const items = [{ name: 'FINAL.PDF', ext: 'pdf', kind: 'pdf' }, { name: 'draft.pdf', ext: 'pdf', kind: 'pdf' }, { name: 'final.txt', ext: 'txt', kind: 'text' }, { name: 'photo.png', ext: 'png', kind: 'image' }]
  const filters = helpers.categoryFilters(items, prefs)
  assert.equal(filters[0].key, 'custom-papers')
  assert.equal(filters[0].count, 1)
  assert.equal(filters.find((item) => item.key === 'pdf').label, 'Papers')
  assert.equal(filters.some((item) => item.key === 'image'), false)
  assert.equal(filters.some((item) => item.key === 'text'), true)
  assert.equal(helpers.categoryFilters([...items, { name: 'table.xlsx', kind: 'sheet' }], prefs).some((item) => item.key === 'sheet'), true)
})

test('directory filters keep sibling prefixes distinct and match Windows drive paths', () => {
  const inside = new Function(`${extractFunction('inDirectory')}\nreturn inDirectory`)()
  assert.equal(inside({ path: '/projects/one/report.pdf' }, '/projects/one/'), true)
  assert.equal(inside({ path: '/projects/one-other/report.pdf' }, '/projects/one'), false)
  assert.equal(inside({ path: 'C:/Projects/REPORT.pdf' }, 'c:/projects'), true)
  assert.equal(inside({ path: '/outside/report.pdf' }, null), true)
})

test('a saved organizer cannot be replaced by an older list response', async () => {
  let respond
  const create = new Function('fetch', 'window', `${extractConst('LIST_URL')}\n${extractFunction('createStore')}\nreturn createStore`)(() => new Promise((resolve) => { respond = resolve }), { setTimeout, clearTimeout })
  const state = create()
  const pending = state.load()
  state.setOrganizer({ preferences: { directories: { extra: [] } }, revision: 'new', directories: [{ path: '/new', enabled: true }, { path: '/paused', enabled: false }] })
  respond({ ok: true, json: async () => ({ items: [], roots: [{ path: '/old' }], organizer: { revision: 'old' } }) })
  await pending
  assert.equal(state.get().organizer.revision, 'new')
  assert.deepEqual(state.get().roots.map((root) => root.path), ['/new'])
  state.dispose()
})

for (const { name, fn } of cases) {
  try {
    await fn()
    passed += 1
    console.log(`ok   ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`)
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
