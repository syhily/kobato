// Userland `node:vfs` behavior on the current Node runtime (Node 26.9+).
// Each test spawns `process.execPath --experimental-vfs` child processes; the
// whole suite skips when the runtime lacks node:vfs support. The SEA-side
// useVfs assertions live in scripts/sea/vfs-capabilities.ts (`pnpm sea:probe`),
// not here — building a SEA is too heavy for the unit project.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const MOUNT_POINT_PATTERN = /^\/dev\/null\/vfs\/\d+$/
const PROBE_TIMEOUT_MS = 30_000

let vfsSupported = false

beforeAll(() => {
  const probe = spawnSync(process.execPath, ['--experimental-vfs', '-e', "require('node:vfs')"], {
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS,
  })
  vfsSupported = probe.status === 0
})

/** Spawn `<node> --experimental-vfs --input-type=module -e <script>` and parse the single JSON line it prints. */
function runVfsProbe(script: string, args: string[] = []): Record<string, unknown> {
  const result = spawnSync(process.execPath, ['--experimental-vfs', '--input-type=module', '-e', script, ...args], {
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS,
  })
  expect(result.error).toBeUndefined()
  expect(result.status, `probe stderr: ${result.stderr}`).toBe(0)
  return JSON.parse(result.stdout.trim())
}

describe('node:vfs (userland, --experimental-vfs)', () => {
  it('mount lifecycle and fs operations through the mount', (context) => {
    if (!vfsSupported) {
      context.skip()
    }
    const out = runVfsProbe(`
import * as vfs from 'node:vfs'
import * as fs from 'node:fs'
const out = {}
const v = vfs.create()
out.beforeMount = { mounted: v.mounted, mountPoint: v.mountPoint, mountPointURL: v.mountPointURL }
const mp = v.mount()
out.mountPoint = mp
out.afterMount = { mounted: v.mounted, mountPoint: v.mountPoint, mountPointURL: String(v.mountPointURL) }
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
v.unmount()
out.afterUnmount = { mounted: v.mounted, mountPoint: v.mountPoint, mountPointURL: v.mountPointURL }
v.unmount() // idempotent
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
`)
    expect(out.beforeMount).toEqual({ mounted: false, mountPoint: null, mountPointURL: null })
    expect(String(out.mountPoint)).toMatch(MOUNT_POINT_PATTERN)
    expect(out.afterMount).toEqual({
      mounted: true,
      mountPoint: out.mountPoint,
      mountPointURL: `file://${String(out.mountPoint)}`,
    })
    expect(out.read).toBe('hello vfs')
    expect(out.stat).toEqual({ size: 9, isFile: true })
    expect(out.readdir).toEqual(['hello.txt', 'sub'])
    expect(out.streamBytes).toBe(100)
    expect(out.afterUnmount).toEqual({ mounted: false, mountPoint: null, mountPointURL: null })
    expect(out.unmountIdempotent).toBe(true)
    expect(out.scopedMountedInside).toBe(true)
    expect(out.scopedUnmountedAfterDispose).toBe(true)
  })

  it('CJS and ESM loader integration', (context) => {
    if (!vfsSupported) {
      context.skip()
    }
    const out = runVfsProbe(`
import * as vfs from 'node:vfs'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createRequire } from 'node:module'
const req = createRequire(import.meta.url)
const out = {}
const v = vfs.create()
const mp = v.mount()
out.mountPoint = mp
fs.mkdirSync(mp + '/pkg')
fs.writeFileSync(mp + '/pkg/package.json', JSON.stringify({ name: 'pkg', main: 'main.cjs' }))
fs.writeFileSync(mp + '/pkg/main.cjs', 'module.exports = { tag: "pkg-main" }')
fs.mkdirSync(mp + '/node_modules/dep', { recursive: true })
fs.writeFileSync(mp + '/node_modules/dep/package.json', JSON.stringify({ name: 'dep', main: 'index.cjs' }))
fs.writeFileSync(mp + '/node_modules/dep/index.cjs', 'module.exports = "dep-via-node-modules"')
fs.writeFileSync(mp + '/pkg/needs-dep.cjs', 'module.exports = require("dep")')
fs.writeFileSync(mp + '/mod.mjs', 'export const esm = "esm-via-mount-url"')
out.packageMain = req(mp + '/pkg').tag
out.nodeModulesLookup = req(mp + '/pkg/needs-dep.cjs')
out.absoluteRequire = req(mp + '/pkg/main.cjs').tag
const realDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfs-cjs-'))
fs.writeFileSync(realDir + '/real.cjs', 'module.exports = require(' + JSON.stringify(mp + '/pkg/main.cjs') + ').tag + "-via-real-fs"')
out.realFsRequiresMount = req(realDir + '/real.cjs')
fs.rmSync(realDir, { recursive: true, force: true })
const mod = await import(v.mountPointURL + '/mod.mjs')
out.esmImport = mod.esm
out.resolved = import.meta.resolve(v.mountPointURL + '/mod.mjs')
console.log(JSON.stringify(out))
`)
    expect(out.packageMain).toBe('pkg-main')
    expect(out.nodeModulesLookup).toBe('dep-via-node-modules')
    expect(out.absoluteRequire).toBe('pkg-main')
    expect(out.realFsRequiresMount).toBe('pkg-main-via-real-fs')
    expect(out.esmImport).toBe('esm-via-mount-url')
    expect(out.resolved).toBe(`file://${String(out.mountPoint)}/mod.mjs`)
  })

  it('invalidates the module cache on unmount (re-mount re-reads)', (context) => {
    if (!vfsSupported) {
      context.skip()
    }
    const out = runVfsProbe(`
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
out.secondRequire = req(mp2 + '/m.cjs')
console.log(JSON.stringify(out))
`)
    expect(out.firstRequire).toBe('content-v1')
    expect(out.sameMountPoint).toBe(true)
    expect(out.secondRequire).toBe('content-v2')
  })

  it('MemoryProvider.setReadOnly makes writes throw EROFS', (context) => {
    if (!vfsSupported) {
      context.skip()
    }
    const out = runVfsProbe(`
import * as vfs from 'node:vfs'
import * as fs from 'node:fs'
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
console.log(JSON.stringify({
  readonlyFlag: v.provider.readonly,
  write: attempt(() => fs.writeFileSync(mp + '/x.txt', 'x')),
  mkdir: attempt(() => fs.mkdirSync(mp + '/d')),
  unlink: attempt(() => fs.unlinkSync(mp + '/seed.txt')),
  readStillWorks: fs.readFileSync(mp + '/seed.txt', 'utf8'),
}))
`)
    expect(out.readonlyFlag).toBe(true)
    expect(out.write).toBe('EROFS')
    expect(out.mkdir).toBe('EROFS')
    expect(out.unlink).toBe('EROFS')
    expect(out.readStillWorks).toBe('seed')
  })

  it('RealFSProvider writes land on disk under the root', (context) => {
    if (!vfsSupported) {
      context.skip()
    }
    const root = mkdtempSync(join(tmpdir(), 'vfs-realfs-'))
    try {
      const out = runVfsProbe(
        `
import * as vfs from 'node:vfs'
import * as fs from 'node:fs'
const root = process.argv[1]
const v = vfs.create(new vfs.RealFSProvider(root))
const mp = v.mount()
fs.writeFileSync(mp + '/landed.txt', 'on-disk')
console.log(JSON.stringify({ mountPoint: mp, readBack: fs.readFileSync(mp + '/landed.txt', 'utf8') }))
`,
        [root],
      )
      expect(out.readBack).toBe('on-disk')
      expect(readFileSync(join(root, 'landed.txt'), 'utf8')).toBe('on-disk')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('ZipProvider exposes zip entries through the mount', (context) => {
    if (!vfsSupported) {
      context.skip()
    }
    const out = runVfsProbe(`
import * as vfs from 'node:vfs'
import * as zlib from 'node:zlib'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
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
const out = {
  root: fs.readdirSync(mp).sort(),
  dir: fs.readdirSync(mp + '/dir'),
  hello: fs.readFileSync(mp + '/hello.txt', 'utf8'),
  nested: fs.readFileSync(mp + '/dir/nested.txt', 'utf8'),
}
fs.rmSync(tmp, { recursive: true, force: true })
console.log(JSON.stringify(out))
`)
    expect(out.root).toEqual(['dir', 'hello.txt'])
    expect(out.dir).toEqual(['nested.txt'])
    expect(out.hello).toBe('zip-hello')
    expect(out.nested).toBe('zip-nested')
  })
})
