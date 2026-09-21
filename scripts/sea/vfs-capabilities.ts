// Capability-verification suite for the Node.js 26.9 VFS features:
//   Group A — userland `node:vfs` probes (cheap child processes).
//   Group B — a mini SEA built with `"useVfs": true` (one --build-sea round).
// Standalone CLI: `node scripts/sea/vfs-capabilities.ts [nodeBinary]`
// (default process.execPath). Exits non-zero on any failed assertion.

import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fail, tryRun } from './exec.ts'
import { repoRoot, SEA_SENTINEL_FUSE } from './paths.ts'

interface CheckResult {
  name: string
  status: 'pass' | 'fail' | 'skip'
  detail: string
}

const USERLAND_TIMEOUT_MS = 30_000
const SEA_BUILD_TIMEOUT_MS = 300_000
const SEA_RUN_TIMEOUT_MS = 120_000

// The VFS mount namespace is a reserved path hierarchy that never exists on
// the real filesystem — empirically `/dev/null/vfs/<n>` on every platform.
const MOUNT_POINT_PATTERN = /^\/dev\/null\/vfs\/\d+$/

const nodeBinary = process.argv[2] ?? process.execPath

const results: CheckResult[] = []
let assertionCount = 0

function assert(condition: unknown, message: string): asserts condition {
  assertionCount += 1
  if (!condition) {
    throw new Error(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  assert(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`)
}

/** Run one named check: print the verdict immediately, record it, never throw. */
function check(name: string, fn: () => string | undefined) {
  try {
    const detail = fn() ?? ''
    results.push({ name, status: 'pass', detail })
    console.log(`  ✓ ${name}${detail === '' ? '' : ` — ${detail}`}`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    results.push({ name, status: 'fail', detail })
    console.log(`  ✗ ${name} — ${detail}`)
  }
}

function skip(name: string, reason: string) {
  results.push({ name, status: 'skip', detail: reason })
  console.log(`  - ${name} — SKIP: ${reason}`)
}

function tailLines(text: string, count: number) {
  return text.trim().split('\n').slice(-count).join('\n')
}

/**
 * Spawn `<nodeBinary> --experimental-vfs --input-type=module -e <script>`.
 * The child prints one JSON object on stdout; non-zero exits fail with the
 * stderr tail. Extra args land in the child's process.argv starting at index 1.
 */
function runUserlandProbe(script: string, args: string[] = []): Record<string, unknown> {
  const result = spawnSync(nodeBinary, ['--experimental-vfs', '--input-type=module', '-e', script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: USERLAND_TIMEOUT_MS,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`probe exited with code ${result.status ?? 'unknown'}: ${tailLines(result.stderr, 8)}`)
  }
  return JSON.parse(result.stdout.trim())
}

// ---------------------------------------------------------------------------
// Group A — userland node:vfs probes
// ---------------------------------------------------------------------------

const PROBE_MOUNT_LIFECYCLE = `
import * as vfs from 'node:vfs'
const out = {}
const v = vfs.create()
out.beforeMount = { mounted: v.mounted, mountPoint: v.mountPoint, mountPointURL: v.mountPointURL }
const mp = v.mount()
out.mountPoint = mp
out.afterMount = { mounted: v.mounted, mountPoint: v.mountPoint, mountPointURL: String(v.mountPointURL) }
v.unmount()
out.afterUnmount = { mounted: v.mounted, mountPoint: v.mountPoint, mountPointURL: v.mountPointURL }
v.unmount() // idempotent: a second unmount must not throw
out.unmountIdempotent = true
let scoped
{
  using s = vfs.create()
  s.mount()
  out.scopedMountedInside = s.mounted
  scoped = s
}
out.scopedUnmountedAfterDispose = !scoped.mounted && scoped.mountPoint === null
console.log(JSON.stringify(out))
`

const PROBE_FS_THROUGH_MOUNT = `
import * as vfs from 'node:vfs'
import * as fs from 'node:fs'
const out = {}
const v = vfs.create()
const mp = v.mount()
out.mountPoint = mp
fs.writeFileSync(mp + '/hello.txt', 'hello vfs')
fs.mkdirSync(mp + '/sub')
fs.writeFileSync(mp + '/sub/nested.txt', '0123456789'.repeat(10))
out.read = fs.readFileSync(mp + '/hello.txt', 'utf8')
const st = fs.statSync(mp + '/hello.txt')
out.stat = { size: st.size, isFile: st.isFile() }
out.readdir = fs.readdirSync(mp).sort()
let bytes = 0
await new Promise((resolve, reject) => {
  const stream = fs.createReadStream(mp + '/sub/nested.txt')
  stream.on('data', (chunk) => (bytes += chunk.length))
  stream.on('end', resolve)
  stream.on('error', reject)
})
out.streamBytes = bytes
console.log(JSON.stringify(out))
`

const PROBE_CJS_LOADER = `
import * as vfs from 'node:vfs'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createRequire } from 'node:module'
const req = createRequire(import.meta.url)
const out = {}
const v = vfs.create()
const mp = v.mount()
fs.mkdirSync(mp + '/pkg')
fs.writeFileSync(mp + '/pkg/package.json', JSON.stringify({ name: 'pkg', main: 'main.cjs' }))
fs.writeFileSync(mp + '/pkg/main.cjs', 'module.exports = { tag: "pkg-main" }')
fs.mkdirSync(mp + '/node_modules/dep', { recursive: true })
fs.writeFileSync(mp + '/node_modules/dep/package.json', JSON.stringify({ name: 'dep', main: 'index.cjs' }))
fs.writeFileSync(mp + '/node_modules/dep/index.cjs', 'module.exports = "dep-via-node-modules"')
fs.writeFileSync(mp + '/pkg/needs-dep.cjs', 'module.exports = require("dep")')
out.packageMain = req(mp + '/pkg').tag
out.nodeModulesLookup = req(mp + '/pkg/needs-dep.cjs')
out.absoluteRequire = req(mp + '/pkg/main.cjs').tag
// A module on the REAL filesystem requiring INTO the mount.
const realDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfs-cjs-'))
fs.writeFileSync(realDir + '/real.cjs', 'module.exports = require(' + JSON.stringify(mp + '/pkg/main.cjs') + ').tag + "-via-real-fs"')
out.realFsRequiresMount = req(realDir + '/real.cjs')
fs.rmSync(realDir, { recursive: true, force: true })
console.log(JSON.stringify(out))
`

const PROBE_ESM_LOADER = `
import * as vfs from 'node:vfs'
import * as fs from 'node:fs'
const out = {}
const v = vfs.create()
const mp = v.mount()
out.mountPoint = mp
fs.writeFileSync(mp + '/mod.mjs', 'export const esm = "esm-via-mount-url"')
const mod = await import(v.mountPointURL + '/mod.mjs')
out.esmImport = mod.esm
out.resolved = import.meta.resolve(v.mountPointURL + '/mod.mjs')
console.log(JSON.stringify(out))
`

const PROBE_CACHE_INVALIDATION = `
import * as vfs from 'node:vfs'
import * as fs from 'node:fs'
import { createRequire } from 'node:module'
const req = createRequire(import.meta.url)
const out = {}
const v = vfs.create()
const mp1 = v.mount()
fs.writeFileSync(mp1 + '/m.cjs', 'module.exports = "content-v1"')
out.firstRequire = req(mp1 + '/m.cjs')
v.unmount()
const mp2 = v.mount()
out.sameMountPoint = mp1 === mp2
fs.writeFileSync(mp2 + '/m.cjs', 'module.exports = "content-v2"')
// The loader cache is keyed by path; unmount must invalidate it so the
// re-mounted file at the SAME path is re-read, not served stale.
out.secondRequire = req(mp2 + '/m.cjs')
console.log(JSON.stringify(out))
`

const PROBE_READ_ONLY = `
import * as vfs from 'node:vfs'
import * as fs from 'node:fs'
const out = {}
const v = vfs.create()
const mp = v.mount()
fs.writeFileSync(mp + '/seed.txt', 'seed')
v.provider.setReadOnly()
const attempt = (fn) => {
  try {
    fn()
    return 'ALLOWED'
  } catch (error) {
    return error.code
  }
}
out.readonlyFlag = v.provider.readonly
out.write = attempt(() => fs.writeFileSync(mp + '/x.txt', 'x'))
out.mkdir = attempt(() => fs.mkdirSync(mp + '/d'))
out.unlink = attempt(() => fs.unlinkSync(mp + '/seed.txt'))
out.readStillWorks = fs.readFileSync(mp + '/seed.txt', 'utf8')
console.log(JSON.stringify(out))
`

const PROBE_REAL_FS = `
import * as vfs from 'node:vfs'
import * as fs from 'node:fs'
const root = process.argv[1]
const out = {}
const v = vfs.create(new vfs.RealFSProvider(root))
const mp = v.mount()
out.mountPoint = mp
fs.writeFileSync(mp + '/landed.txt', 'on-disk')
out.readBackThroughMount = fs.readFileSync(mp + '/landed.txt', 'utf8')
console.log(JSON.stringify(out))
`

const PROBE_ZIP = `
import * as vfs from 'node:vfs'
import * as zlib from 'node:zlib'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
// Build a zip archive with the node:zlib ZIP API: an empty archive is a
// bare end-of-central-directory record, then add entries in place.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vfs-zip-'))
const zipPath = path.join(tmp, 'mem.zip')
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0)
fs.writeFileSync(zipPath, eocd)
const zip = zlib.ZipFile.openSync(zipPath, { writable: true })
zip.addSync('hello.txt', Buffer.from('zip-hello'))
zip.addSync('dir/nested.txt', Buffer.from('zip-nested'))
zip.closeSync()
const v = vfs.create(new vfs.ZipProvider(new zlib.ZipBuffer(fs.readFileSync(zipPath))))
const mp = v.mount()
const out = {}
out.root = fs.readdirSync(mp).sort()
out.dir = fs.readdirSync(mp + '/dir')
out.hello = fs.readFileSync(mp + '/hello.txt', 'utf8')
out.nested = fs.readFileSync(mp + '/dir/nested.txt', 'utf8')
fs.rmSync(tmp, { recursive: true, force: true })
console.log(JSON.stringify(out))
`

function hasVfsSupport() {
  const probe = spawnSync(nodeBinary, ['--experimental-vfs', '-e', "require('node:vfs')"], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: USERLAND_TIMEOUT_MS,
  })
  return probe.status === 0
}

function runUserlandGroup() {
  console.log('\nGroup A — userland node:vfs probes')
  if (!hasVfsSupport()) {
    console.log(`  SKIP group A: ${nodeBinary} does not support node:vfs (--experimental-vfs)`)
    return
  }

  check('mount lifecycle (mount/unmount/using)', () => {
    const out = runUserlandProbe(PROBE_MOUNT_LIFECYCLE)
    const before = out.beforeMount
    const after = out.afterMount
    const unmounted = out.afterUnmount
    assert(
      isRecord(before) && isRecord(after) && isRecord(unmounted),
      'mount lifecycle probe must return state objects',
    )
    assert(
      before.mounted === false && before.mountPoint === null && before.mountPointURL === null,
      'fresh VFS must be unmounted',
    )
    assert(
      MOUNT_POINT_PATTERN.test(String(out.mountPoint)),
      `mount point ${String(out.mountPoint)} outside the reserved vfs namespace`,
    )
    assert(after.mounted === true && after.mountPoint === out.mountPoint, 'mounted/mountPoint must reflect the mount')
    assertEquals(
      after.mountPointURL,
      `file://${String(out.mountPoint)}`,
      'mountPointURL must be the file URL of the mount point',
    )
    assert(
      unmounted.mounted === false && unmounted.mountPoint === null && unmounted.mountPointURL === null,
      'unmount must reset the state',
    )
    assertEquals(out.unmountIdempotent, true, 'second unmount must not throw')
    assertEquals(out.scopedMountedInside, true, 'scoped VFS must be mounted inside the using block')
    assertEquals(out.scopedUnmountedAfterDispose, true, 'using disposal must unmount')
  })

  check('fs operations through the mount', () => {
    const out = runUserlandProbe(PROBE_FS_THROUGH_MOUNT)
    assertEquals(out.read, 'hello vfs', 'readFileSync through the mount')
    const stat = out.stat
    assert(isRecord(stat), 'stat probe must return an object')
    assertEquals(stat.size, 9, 'statSync size')
    assertEquals(stat.isFile, true, 'statSync isFile')
    assertEquals(JSON.stringify(out.readdir), JSON.stringify(['hello.txt', 'sub']), 'readdirSync through the mount')
    assertEquals(out.streamBytes, 100, 'createReadStream byte count')
  })

  check('CJS loader integration', () => {
    const out = runUserlandProbe(PROBE_CJS_LOADER)
    assertEquals(out.packageMain, 'pkg-main', 'require of a mounted dir must honor package.json main')
    assertEquals(out.nodeModulesLookup, 'dep-via-node-modules', 'node_modules lookup must be confined to the mount')
    assertEquals(out.absoluteRequire, 'pkg-main', 'absolute require of a mounted file')
    assertEquals(
      out.realFsRequiresMount,
      'pkg-main-via-real-fs',
      'a real-fs module must be able to require into the mount',
    )
  })

  check('ESM loader integration', () => {
    const out = runUserlandProbe(PROBE_ESM_LOADER)
    assertEquals(out.esmImport, 'esm-via-mount-url', 'dynamic import via mountPointURL')
    assertEquals(out.resolved, `file://${String(out.mountPoint)}/mod.mjs`, 'import.meta.resolve of a mounted path')
  })

  check('module cache invalidated on unmount', () => {
    const out = runUserlandProbe(PROBE_CACHE_INVALIDATION)
    assertEquals(out.firstRequire, 'content-v1', 'first require')
    assertEquals(out.sameMountPoint, true, 're-mounting the same VFS must reuse the mount point')
    assertEquals(
      out.secondRequire,
      'content-v2',
      'require after re-mount must re-read the file, not serve the stale cache entry',
    )
  })

  check('MemoryProvider.setReadOnly enforces EROFS', () => {
    const out = runUserlandProbe(PROBE_READ_ONLY)
    assertEquals(out.readonlyFlag, true, 'provider readonly flag')
    assertEquals(out.write, 'EROFS', 'writeFileSync on a read-only provider')
    assertEquals(out.mkdir, 'EROFS', 'mkdirSync on a read-only provider')
    assertEquals(out.unlink, 'EROFS', 'unlinkSync on a read-only provider')
    assertEquals(out.readStillWorks, 'seed', 'reads must keep working on a read-only provider')
  })

  check('RealFSProvider writes land on disk', () => {
    const root = mkdtempSync(join(tmpdir(), 'vfs-realfs-'))
    try {
      const out = runUserlandProbe(PROBE_REAL_FS, [root])
      assertEquals(out.readBackThroughMount, 'on-disk', 'read back through the mount')
      assertEquals(
        readFileSync(join(root, 'landed.txt'), 'utf8'),
        'on-disk',
        'the write must land on the real filesystem under the provider root',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  check('ZipProvider exposes zip entries', () => {
    const out = runUserlandProbe(PROBE_ZIP)
    assertEquals(JSON.stringify(out.root), JSON.stringify(['dir', 'hello.txt']), 'zip root entries')
    assertEquals(JSON.stringify(out.dir), JSON.stringify(['nested.txt']), 'zip nested dir entries')
    assertEquals(out.hello, 'zip-hello', 'zip entry content')
    assertEquals(out.nested, 'zip-nested', 'zip nested entry content')
  })
}

// ---------------------------------------------------------------------------
// Group B — mini SEA with "useVfs": true
// ---------------------------------------------------------------------------

/** Find a platform package directory inside node_modules/.pnpm (e.g. /^@napi-rs\+canvas-/). */
function findPnpmPackageDir(pattern: RegExp) {
  const pnpmDir = join(repoRoot, 'node_modules', '.pnpm')
  const entry = readdirSync(pnpmDir).find((name) => pattern.test(name))
  return entry === undefined ? null : join(pnpmDir, entry)
}

function findFileRecursive(dir: string, match: (name: string) => boolean): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, match)
      if (found !== null) {
        return found
      }
    } else if (match(entry.name)) {
      return full
    }
  }
  return null
}

function findSkiaAddon() {
  const dir = findPnpmPackageDir(/^@napi-rs\+canvas-/)
  return dir === null ? null : findFileRecursive(dir, (name) => name.endsWith('.node'))
}

function findSharpAddon() {
  const dir = findPnpmPackageDir(/^@img\+sharp-(?!libvips)/)
  return dir === null ? null : findFileRecursive(dir, (name) => name.endsWith('.node'))
}

function findLibvipsLibrary() {
  const dir = findPnpmPackageDir(/^@img\+sharp-libvips-/)
  return dir === null ? null : findFileRecursive(dir, (name) => /\.(dylib|so(\..*)?|dll)$/.test(name))
}

/** The mini-SEA payload: runs every assertion itself, prints one `KEY: value` line per result. */
function seaMainScript(options: { skia: boolean; sharp: boolean }) {
  const nativeProbes: string[] = []
  if (options.skia) {
    nativeProbes.push(`
try {
  const skia = req('./natives/skia.node')
  print('skia', 'loaded ' + Object.keys(skia).length + ' exports')
} catch (error) {
  print('skia', 'ERR ' + ((error.code ?? '') + ' ' + error.message))
}`)
  }
  if (options.sharp) {
    nativeProbes.push(`
try {
  req('./natives/sharp.node')
  print('sharp', 'ALLOWED')
} catch (error) {
  print('sharp', error.code ?? error.message)
}`)
  }
  return `
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { Worker } from 'node:worker_threads'
import * as sea from 'node:sea'

// Child mode: reproduce the async fs.writev crash under useVfs. A buffered
// createWriteStream on a REAL file triggers WriteStream._writev → fs.writev,
// which lib/fs.js dispatches to a VFS handler table that lacks writev.
if (process.env.SEA_PROBE_WRITEV === '1') {
  const target = path.join(os.tmpdir(), 'sea-writev-probe-' + process.pid + '.bin')
  const stream = fs.createWriteStream(target)
  const chunk = Buffer.alloc(64 * 1024, 'a')
  for (let i = 0; i < 256; i++) stream.write(chunk)
  stream.end(() => {
    console.log('writevOutcome: ok ' + fs.statSync(target).size)
    fs.rmSync(target, { force: true })
    process.exit(0)
  })
} else {
const print = (key, value) => console.log(key + ': ' + value)
const root = import.meta.dirname

print('isSea', sea.isSea())
print('dirname', root)
print('rootEntries', fs.readdirSync(root).sort().join(','))
print('recursiveCount', fs.readdirSync(root, { recursive: true }).length)
print('hello', fs.readFileSync(root + '/data/hello.txt', 'utf8'))
try {
  fs.writeFileSync(root + '/nope.txt', 'x')
  print('writeVfs', 'ALLOWED')
} catch (error) {
  print('writeVfs', error.code)
}
const realPath = path.join(os.tmpdir(), 'sea-vfs-probe-' + process.pid + '.txt')
try {
  fs.writeFileSync(realPath, 'real-fs-ok')
  print('realFsWrite', fs.readFileSync(realPath, 'utf8'))
} catch (error) {
  print('realFsWrite', 'ERR ' + error.code)
} finally {
  fs.rmSync(realPath, { force: true })
}
print('execPathExists', fs.existsSync(process.execPath))
try {
  const mod = await import('./lib/greet.mjs')
  print('esmImport', mod.greet())
} catch (error) {
  print('esmImport', 'ERR ' + error.message)
}
const req = createRequire(import.meta.url)
try {
  print('cjsRequire', req('./lib/cjs-mod.cjs').tag)
} catch (error) {
  print('cjsRequire', 'ERR ' + error.message)
}
try {
  print('cjsDep', req('leftpad'))
} catch (error) {
  print('cjsDep', 'ERR ' + error.message)
}
try {
  print('resolve', import.meta.resolve('./lib/greet.mjs'))
} catch (error) {
  print('resolve', 'ERR ' + error.message)
}
print('seaAssetKeys', sea.getAssetKeys().includes('data/hello.txt') ? 'has-hello' : 'missing-hello')
print('seaAsset', new TextDecoder().decode(sea.getAsset('data/hello.txt')))
// PINNED LIMITATION: a Worker cannot be spawned from a path inside the VFS.
const workerPath = root + '/lib/worker.mjs'
const workerPathResult = await new Promise((resolve) => {
  try {
    const worker = new Worker(workerPath, { execArgv: ['--input-type=module'] })
    worker.once('error', (error) => resolve('ERROR ' + error.message))
    worker.once('exit', (code) => resolve('EXIT ' + code))
  } catch (error) {
    resolve('THROW ' + error.message)
  }
})
print('workerPath', workerPathResult)
// ...but a Worker running code READ from the VFS with eval:true works.
const workerCode = fs.readFileSync(workerPath, 'utf8')
const workerEvalResult = await new Promise((resolve) => {
  try {
    const worker = new Worker(workerCode, { eval: true, execArgv: ['--input-type=module'] })
    worker.once('error', (error) => resolve('ERROR ' + error.message))
    worker.once('exit', (code) => resolve('EXIT ' + code))
  } catch (error) {
    resolve('THROW ' + error.message)
  }
})
print('workerEval', workerEvalResult)
// node:vfs is not available inside a SEA.
try {
  await import('node:vfs')
  print('nodeVfs', 'ALLOWED')
} catch (error) {
  print('nodeVfs', error.code)
}
// PINNED LIMITATION (upstream bug, runtime-patched by kobato): async
// fs.writev on a real fd crashes under useVfs — the VFS handler table lacks
// the async readv/writev hooks lib/fs.js calls unguarded. Re-run this same
// binary in child mode; the child either crashes with the signature or
// (once Node fixes it) prints writevOutcome: ok.
const writevChild = spawnSync(process.execPath, [], {
  env: { ...process.env, SEA_PROBE_WRITEV: '1' },
  cwd: os.tmpdir(),
  encoding: 'utf8',
  timeout: 60000,
})
print('writevChildStatus', writevChild.status === null ? 'signal:' + writevChild.signal : writevChild.status)
print(
  'writevChildSignature',
  (writevChild.stderr ?? '').includes('writev is not a function')
    ? 'crash'
    : (writevChild.stdout ?? '').includes('writevOutcome: ok')
      ? 'fixed'
      : 'unexpected',
)
${nativeProbes.join('\n')}
}
`
}

function runSeaGroup() {
  console.log('\nGroup B — mini SEA with "useVfs": true')

  const binary = readFileSync(nodeBinary)
  if (!binary.includes(SEA_SENTINEL_FUSE)) {
    fail(
      [
        `The Node.js executable at ${nodeBinary} does not contain the SEA sentinel fuse.`,
        'Single-executable builds require an official Node.js distribution (nodejs.org);',
        'Homebrew and other shared-library builds lack the fuse.',
        'Pass an official dist path: node scripts/sea/vfs-capabilities.ts /path/to/official/node',
      ].join('\n'),
    )
  }

  const skiaAddon = findSkiaAddon()
  const sharpAddon = findSharpAddon()
  const libvipsLibrary = findLibvipsLibrary()

  const tempDir = mkdtempSync(join(tmpdir(), 'sea-vfs-probe-'))
  try {
    const assetsDir = join(tempDir, 'assets')
    mkdirSync(join(assetsDir, 'data'), { recursive: true })
    mkdirSync(join(assetsDir, 'lib'), { recursive: true })
    mkdirSync(join(assetsDir, 'node_modules', 'leftpad'), { recursive: true })
    writeFileSync(join(assetsDir, 'data', 'hello.txt'), 'hello from the sea vfs')
    writeFileSync(join(assetsDir, 'lib', 'greet.mjs'), 'export const greet = () => "esm-greet-ok"\n')
    writeFileSync(join(assetsDir, 'lib', 'cjs-mod.cjs'), 'module.exports = { tag: "cjs-require-ok" }\n')
    writeFileSync(join(assetsDir, 'lib', 'worker.mjs'), "console.log('worker body evaluated')\n")
    writeFileSync(
      join(assetsDir, 'node_modules', 'leftpad', 'package.json'),
      JSON.stringify({ name: 'leftpad', main: 'index.cjs' }),
    )
    writeFileSync(
      join(assetsDir, 'node_modules', 'leftpad', 'index.cjs'),
      'module.exports = "leftpad-via-mount-node-modules"\n',
    )

    const assets: Record<string, string> = {
      'data/hello.txt': join(assetsDir, 'data', 'hello.txt'),
      'lib/greet.mjs': join(assetsDir, 'lib', 'greet.mjs'),
      'lib/cjs-mod.cjs': join(assetsDir, 'lib', 'cjs-mod.cjs'),
      'lib/worker.mjs': join(assetsDir, 'lib', 'worker.mjs'),
      'node_modules/leftpad/package.json': join(assetsDir, 'node_modules', 'leftpad', 'package.json'),
      'node_modules/leftpad/index.cjs': join(assetsDir, 'node_modules', 'leftpad', 'index.cjs'),
    }
    if (skiaAddon !== null) {
      mkdirSync(join(assetsDir, 'natives'), { recursive: true })
      copyFileSync(skiaAddon, join(assetsDir, 'natives', 'skia.node'))
      assets['natives/skia.node'] = join(assetsDir, 'natives', 'skia.node')
    }
    if (sharpAddon !== null) {
      mkdirSync(join(assetsDir, 'natives'), { recursive: true })
      copyFileSync(sharpAddon, join(assetsDir, 'natives', 'sharp.node'))
      assets['natives/sharp.node'] = join(assetsDir, 'natives', 'sharp.node')
      if (libvipsLibrary !== null) {
        // Embed the dependent dylib too: the pinned limitation is that the
        // addon fails from the VFS even when its dylib rides along.
        const libvipsName = 'libvips-cpp' + libvipsLibrary.slice(libvipsLibrary.lastIndexOf('.'))
        copyFileSync(libvipsLibrary, join(assetsDir, 'natives', libvipsName))
        assets[`natives/${libvipsName}`] = join(assetsDir, 'natives', libvipsName)
      }
    }

    const outputPath = join(tempDir, process.platform === 'win32' ? 'vfs-probe-sea.exe' : 'vfs-probe-sea')
    writeFileSync(join(tempDir, 'main.mjs'), seaMainScript({ skia: skiaAddon !== null, sharp: sharpAddon !== null }))
    const configPath = join(tempDir, 'sea-config.json')
    writeFileSync(
      configPath,
      JSON.stringify({
        main: join(tempDir, 'main.mjs'),
        mainFormat: 'module',
        output: outputPath,
        disableExperimentalSEAWarning: true,
        useVfs: true,
        assets,
      }),
    )

    check('mini SEA builds with useVfs', () => {
      const build = spawnSync(nodeBinary, ['--build-sea', configPath], {
        cwd: tempDir,
        encoding: 'utf8',
        timeout: SEA_BUILD_TIMEOUT_MS,
      })
      if (build.error) {
        throw build.error
      }
      assert(
        build.status === 0,
        `--build-sea exited with code ${build.status ?? 'unknown'}: ${tailLines(build.stderr, 8)}`,
      )
      if (process.platform === 'darwin') {
        // Best-effort: a modified binary needs an ad-hoc signature on darwin.
        tryRun('codesign', ['--remove-signature', outputPath])
        tryRun('codesign', ['--sign', '-', '--force', outputPath])
      }
      return 'node --build-sea'
    })

    let lines = new Map<string, string>()
    check('mini SEA executes', () => {
      const run = spawnSync(outputPath, [], { cwd: tempDir, encoding: 'utf8', timeout: SEA_RUN_TIMEOUT_MS })
      if (run.error) {
        throw run.error
      }
      assert(run.status === 0, `binary exited with code ${run.status ?? 'unknown'}: ${tailLines(run.stderr, 8)}`)
      for (const line of run.stdout.split('\n')) {
        const match = /^([a-zA-Z]+): (.*)$/.exec(line)
        if (match !== null) {
          lines.set(match[1], match[2])
        }
      }
      assert(lines.has('isSea'), `binary produced no probe output: ${tailLines(run.stdout, 8)}`)
      return `${lines.size} result lines`
    })

    check('SEA identity and mount layout', () => {
      assertEquals(lines.get('isSea'), 'true', 'sea.isSea()')
      assert(
        MOUNT_POINT_PATTERN.test(lines.get('dirname') ?? ''),
        `import.meta.dirname ${lines.get('dirname')} outside the reserved vfs namespace`,
      )
      const entries = (lines.get('rootEntries') ?? '').split(',')
      for (const expected of ['data', 'lib', 'node_modules']) {
        assert(entries.includes(expected), `mount root is missing ${expected}`)
      }
      assert(Number(lines.get('recursiveCount')) > entries.length, 'recursive readdir must see nested entries')
    })

    check('SEA fs semantics (read, EROFS, real fs unaffected)', () => {
      assertEquals(lines.get('hello'), 'hello from the sea vfs', 'readFileSync of an embedded asset')
      assertEquals(lines.get('writeVfs'), 'EROFS', 'writes into the mount must throw EROFS')
      assertEquals(lines.get('realFsWrite'), 'real-fs-ok', 'writes outside the mount must work')
      assertEquals(lines.get('execPathExists'), 'true', 'process.execPath must still be the real binary')
    })

    check('SEA module loaders (ESM, CJS, node_modules, resolve)', () => {
      assertEquals(lines.get('esmImport'), 'esm-greet-ok', 'relative ESM import from the mount')
      assertEquals(lines.get('cjsRequire'), 'cjs-require-ok', 'createRequire of a mounted CJS file')
      assertEquals(lines.get('cjsDep'), 'leftpad-via-mount-node-modules', 'node_modules lookup inside the mount')
      assert(
        (lines.get('resolve') ?? '').endsWith('/lib/greet.mjs') &&
          (lines.get('resolve') ?? '').startsWith('file:///dev/null/vfs/'),
        `import.meta.resolve returned ${lines.get('resolve')}`,
      )
    })

    check('node:sea asset API alongside useVfs', () => {
      assertEquals(lines.get('seaAssetKeys'), 'has-hello', 'getAssetKeys must list the embedded assets')
      assertEquals(lines.get('seaAsset'), 'hello from the sea vfs', 'getAsset must return the asset bytes')
    })

    check('Worker limitations (pinned)', () => {
      const workerPath = lines.get('workerPath') ?? ''
      assert(
        workerPath.startsWith('ERROR') && workerPath.includes('Cannot find module'),
        `new Worker(vfsPath) must fail with "Cannot find module", got: ${workerPath}`,
      )
      assertEquals(lines.get('workerEval'), 'EXIT 0', 'new Worker(codeFromVfs, { eval: true }) must run')
    })

    check('node:vfs unavailable inside a SEA (pinned)', () => {
      assertEquals(lines.get('nodeVfs'), 'ERR_UNKNOWN_BUILTIN_MODULE', 'import node:vfs inside a SEA')
    })

    check('async fs.writev crashes on real files under useVfs (pinned upstream bug)', () => {
      // Upstream: the mounted-VFS handler table (lib/internal/vfs/setup.js)
      // implements readvSync/writevSync but not the async readv/writev that
      // lib/fs.js calls unguarded — any buffered WriteStream flush kills the
      // process. kobato repairs it at runtime (src/server/infra/
      // sea-vfs-fs-patch.ts); a 'fixed' signature here means the patch can be
      // revisited (and this check flipped to assert the healthy path).
      assertEquals(
        lines.get('writevChildSignature'),
        'crash',
        `expected the writev child to crash with the missing-handler signature (status ${lines.get('writevChildStatus')})`,
      )
    })

    if (skiaAddon === null) {
      skip('self-contained .node addon loads from the VFS', '@napi-rs/canvas platform package not installed')
    } else {
      check('self-contained .node addon loads from the VFS (pinned capability)', () => {
        const skia = lines.get('skia') ?? ''
        assert(skia.startsWith('loaded '), `skia.node must load from the VFS, got: ${skia}`)
        assert(Number(skia.slice('loaded '.length).split(' ')[0]) > 0, 'skia.node must export symbols')
      })
    }

    if (sharpAddon === null) {
      skip('sharp addon with dependent dylibs fails from the VFS', 'sharp platform package not installed')
    } else {
      check('sharp addon with dependent dylibs fails from the VFS (pinned limitation)', () => {
        assertEquals(lines.get('sharp'), 'ERR_DLOPEN_FAILED', 'requiring sharp.node from the VFS')
      })
    }

    check('useVfs + useCodeCache rejected at build time', () => {
      const badConfigPath = join(tempDir, 'sea-config-codecache.json')
      writeFileSync(
        badConfigPath,
        JSON.stringify({
          main: join(tempDir, 'main.mjs'),
          mainFormat: 'module',
          output: join(tempDir, 'should-not-exist'),
          disableExperimentalSEAWarning: true,
          useVfs: true,
          useCodeCache: true,
          assets: {},
        }),
      )
      const build = spawnSync(nodeBinary, ['--build-sea', badConfigPath], {
        cwd: tempDir,
        encoding: 'utf8',
        timeout: SEA_BUILD_TIMEOUT_MS,
      })
      const output = `${build.stdout}\n${build.stderr}`
      assert(build.status !== 0, '--build-sea with useVfs+useCodeCache must fail')
      assert(
        output.includes('"useVfs" is not supported when "useCodeCache" is true'),
        `unexpected rejection message: ${tailLines(output, 5)}`,
      )
    })
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------

console.log(`VFS capability suite — node binary: ${nodeBinary}`)
runUserlandGroup()
runSeaGroup()

const passed = results.filter((r) => r.status === 'pass').length
const failed = results.filter((r) => r.status === 'fail').length
const skipped = results.filter((r) => r.status === 'skip').length
console.log(`\nSummary: ${passed} passed, ${failed} failed, ${skipped} skipped (${assertionCount} assertions)`)
if (failed > 0) {
  fail(`${failed} VFS capability check(s) failed`)
}
