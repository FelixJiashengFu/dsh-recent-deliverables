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
function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`ok   ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`)
  }
}

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
      assert.equal(entry.id, '@jiashengfu/dsh-recent-deliverables')
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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
