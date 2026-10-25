/**
 * Pure-logic checks for the Recent Deliverables bundle.
 *
 * Run with: `node test/logic.test.mjs`. No framework, no DSH runtime: these
 * cases cover the rules that decide what the panel lists and in which order.
 */
import assert from 'node:assert/strict'
import {
  DEFAULT_EXTENSIONS,
  extnameOf,
  isAbsolutePath,
  isJunkFileName,
  isPathInside,
  isSkippedDirName,
  kindOfPath,
  mediaOfPath,
  mergeDeliverables,
  normalizeConfig,
  normalizeExtension,
  publicItem,
  toAbsolutePath,
  withoutTrailingSeparators,
} from '../logic.js'

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

test('extnameOf handles dots, separators, and dotfiles', () => {
  assert.equal(extnameOf('/a/b/report.PDF'), 'pdf')
  assert.equal(extnameOf('C:\\Users\\x\\a.html'), 'html')
  assert.equal(extnameOf('/a/b/archive.tar.gz'), 'gz')
  assert.equal(extnameOf('/a/b/.hid'), '')
  assert.equal(extnameOf('/a/b/no-extension'), '')
  assert.equal(extnameOf('/a/b/trailing.'), '')
})

test('kindOfPath maps the allowlist and rejects unknown extensions', () => {
  assert.equal(kindOfPath('/x/a.pdf'), 'pdf')
  assert.equal(kindOfPath('/x/a.HTML'), 'web')
  assert.equal(kindOfPath('/x/a.docx'), 'doc')
  assert.equal(kindOfPath('/x/a.xlsx'), 'sheet')
  assert.equal(kindOfPath('/x/a.pptx'), 'slide')
  assert.equal(kindOfPath('/x/a.svg'), 'image')
  assert.equal(kindOfPath('/x/a.md'), 'text')
  assert.equal(kindOfPath('/x/a.mp4'), 'media')
  assert.equal(kindOfPath('/x/a.zip'), 'archive')
  assert.equal(kindOfPath('/x/a.py'), null)
  assert.equal(kindOfPath('/x/a.py', new Set(['py'])), 'other')
})

test('normalizeExtension strips dots and case', () => {
  assert.equal(normalizeExtension('.PDF'), 'pdf')
  assert.equal(normalizeExtension('  Html '), 'html')
  assert.equal(normalizeExtension(7), '')
})

test('junk and skipped-directory classification', () => {
  assert.equal(isJunkFileName('._report.pdf'), true)
  assert.equal(isJunkFileName('.DS_Store'), true)
  assert.equal(isJunkFileName('Thumbs.db'), true)
  assert.equal(isJunkFileName('report.pdf'), false)
  assert.equal(isSkippedDirName('node_modules'), true)
  assert.equal(isSkippedDirName('.git'), true)
  assert.equal(isSkippedDirName('dist'), true)
  assert.equal(isSkippedDirName('thermo6'), false)
})

test('absolute paths and workspace resolution', () => {
  assert.equal(isAbsolutePath('/a/b'), true)
  assert.equal(isAbsolutePath('C:\\a\\b'), true)
  assert.equal(isAbsolutePath('a/b'), false)
  assert.equal(toAbsolutePath('report.pdf', '/w'), '/w/report.pdf')
  assert.equal(toAbsolutePath('/abs/report.pdf', '/w'), '/abs/report.pdf')
  assert.equal(toAbsolutePath('sub/report.pdf', 'C:\\w'), 'C:\\w\\sub/report.pdf')
  assert.equal(withoutTrailingSeparators('/a/b///'), '/a/b')
  assert.equal(withoutTrailingSeparators('/'), '/')
})

test('isPathInside does not confuse a prefix with a sibling', () => {
  assert.equal(isPathInside('/a/b', '/a/b/c.pdf'), true)
  assert.equal(isPathInside('/a/b', '/a/b'), true)
  assert.equal(isPathInside('/a/b', '/a/bc/c.pdf'), false)
  assert.equal(isPathInside('/a/b/', '/a/b/c.pdf'), true)
  assert.equal(isPathInside('/a/b', '/a'), false)
})

test('mediaOfPath inline previews only for browser-renderable kinds', () => {
  assert.deepEqual(
    { ...mediaOfPath('/x/a.pdf'), inline: mediaOfPath('/x/a.pdf').inline },
    { ext: 'pdf', kind: 'pdf', mime: 'application/pdf', inline: true },
  )
  assert.equal(mediaOfPath('/x/a.html').mime.startsWith('text/html'), true)
  assert.equal(mediaOfPath('/x/a.png').inline, true)
  assert.equal(mediaOfPath('/x/a.csv').inline, true)
  assert.equal(mediaOfPath('/x/a.docx').inline, false)
  assert.equal(mediaOfPath('/x/a.docx').mime.includes('wordprocessingml'), true)
  assert.equal(mediaOfPath('/x/a.weird').mime, 'application/octet-stream')
})

test('normalizeConfig fills defaults and clamps out-of-range values', () => {
  const defaults = normalizeConfig(undefined)
  assert.equal(defaults.maxItems, 40)
  assert.equal(defaults.declaredSlots, 12)
  assert.equal(defaults.maxSessions, 16)
  assert.equal(defaults.maxSessionAgeDays, 60)
  assert.equal(defaults.scanDepth, 5)
  assert.equal(defaults.maxScanFiles, 12000)
  assert.equal(defaults.cacheMs, 15000)
  assert.equal(defaults.includePresent, true)
  assert.equal(defaults.includeFiles, true)
  assert.deepEqual(defaults.extraRoots, [])
  assert.equal(defaults.extensions, DEFAULT_EXTENSIONS)

  const clamped = normalizeConfig({ maxItems: 9999, scanDepth: -3, maxSessions: 'many', includeFiles: false })
  assert.equal(clamped.maxItems, 40)
  assert.equal(clamped.scanDepth, 5)
  assert.equal(clamped.maxSessions, 16)
  assert.equal(clamped.includeFiles, false)

  const custom = normalizeConfig({ extensions: ['.PDF', 'epub'], declaredSlots: 0, extraRoots: ['/a'] })
  assert.deepEqual([...custom.extensions].sort(), ['epub', 'pdf'])
  assert.equal(custom.declaredSlots, 0)
  assert.deepEqual(custom.extraRoots, ['/a'])
})

test('mergeDeliverables upgrades a declared path and keeps one entry', () => {
  const files = [
    { path: '/w/b.pdf', name: 'b.pdf', kind: 'pdf', bytes: 10, mtime: 1000, origin: 'file', rootLabel: 'W' },
    { path: '/w/c.html', name: 'c.html', kind: 'web', bytes: 20, mtime: 900, origin: 'file', rootLabel: 'W' },
  ]
  const present = [
    {
      path: '/w/b.pdf',
      name: 'b.pdf',
      kind: 'pdf',
      bytes: 10,
      mtime: 900,
      origin: 'present',
      description: 'final report',
      sessionId: 's1',
      sessionTitle: 'Thermo',
      presentedAt: 1200,
    },
  ]
  const result = mergeDeliverables(present, files, 10, 12)
  assert.equal(result.items.length, 2)
  const merged = result.items.find((item) => item.path === '/w/b.pdf')
  assert.equal(merged.origin, 'present')
  assert.equal(merged.description, 'final report')
  assert.equal(merged.sessionTitle, 'Thermo')
  assert.equal(merged.mtime, 1000, 'newest mtime wins')
  assert.equal(result.counts.declared, 1)
  assert.equal(result.counts.declaredShown, 1)
})

test('mergeDeliverables reserves declared slots against a burst of files', () => {
  const files = Array.from({ length: 30 }, (_, index) => ({
    path: `/w/new-${index}.png`,
    name: `new-${index}.png`,
    kind: 'image',
    bytes: 1,
    mtime: 10_000 - index,
    origin: 'file',
  }))
  const present = Array.from({ length: 5 }, (_, index) => ({
    path: `/w/old-${index}.pdf`,
    name: `old-${index}.pdf`,
    kind: 'pdf',
    bytes: 1,
    mtime: 1_000 - index,
    origin: 'present',
    presentedAt: 5_000,
  }))
  const result = mergeDeliverables(present, files, 10, 3)
  assert.equal(result.items.length, 10)
  assert.equal(result.counts.declaredShown, 3)
  assert.equal(result.items.filter((item) => item.origin === 'present').length, 3)
  // Sorted newest-first across both sources.
  for (let index = 1; index < result.items.length; index += 1) {
    assert.ok(result.items[index - 1].mtime >= result.items[index].mtime)
  }
})

test('mergeDeliverables keeps every item when under the cap', () => {
  const files = [{ path: '/w/a.pdf', name: 'a.pdf', kind: 'pdf', bytes: 1, mtime: 5, origin: 'file' }]
  const present = [{ path: '/w/b.pdf', name: 'b.pdf', kind: 'pdf', bytes: 1, mtime: 6, origin: 'present' }]
  const result = mergeDeliverables(present, files, 40, 12)
  assert.equal(result.items.length, 2)
  assert.equal(result.items[0].path, '/w/b.pdf')
  assert.equal(result.counts.truncated, false)
})

test('declared slots reserve space without limiting declared-only lists', () => {
  const present = Array.from({ length: 50 }, (_, i) => ({ path: `/w/${i}.pdf`, origin: 'present', mtime: i }))
  const under = mergeDeliverables(present.slice(0, 20), [], 40, 12)
  assert.equal(under.items.length, 20)
  assert.equal(under.counts.declaredShown, 20)
  assert.equal(under.counts.truncated, false)
  const over = mergeDeliverables(present, [], 40, 12)
  assert.equal(over.items.length, 40)
  assert.equal(over.counts.truncated, true)
  assert.equal(mergeDeliverables(present.slice(0, 20), [], 40, 0).items.length, 20)
})

test('spare list capacity is filled by remaining declarations in time order', () => {
  const present = Array.from({ length: 8 }, (_, i) => ({ path: `/w/${i}.pdf`, origin: 'present', mtime: i }))
  const files = [{ path: '/w/new.png', origin: 'file', mtime: 100 }]
  const result = mergeDeliverables(present, files, 6, 2)
  assert.equal(result.items.length, 6)
  assert.equal(result.counts.declaredShown, 5)
  assert.equal(result.items[0].path, '/w/new.png')
  assert.equal(result.counts.truncated, true)
})

test('publicItem normalizes and drops empty optional fields', () => {
  const item = publicItem({
    path: '/w/report.pdf',
    name: '',
    bytes: 12,
    mtime: 1234,
    origin: 'present',
    description: 'x',
    sessionId: undefined,
    sessionTitle: '',
  })
  assert.equal(item.name, 'report.pdf')
  assert.equal(item.ext, 'pdf')
  assert.equal(item.kind, 'pdf')
  assert.equal(item.previewable, true)
  assert.equal(item.description, 'x')
  assert.equal('sessionId' in item, false)
  assert.equal('sessionTitle' in item, false)
  assert.equal(publicItem({ path: '' }), undefined)
  assert.equal(publicItem(null), undefined)
  assert.equal(publicItem({ path: '/w/a.docx' }).previewable, false)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
