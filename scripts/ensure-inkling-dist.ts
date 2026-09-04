#!/usr/bin/env node

// Guard for the inkling workspace build: packages/inkling/dist is gitignored
// (built artifact), but every kobato entry point (dev/type/build, and through
// `pnpm run build` also sea:build) needs it. pnpm runs this script via the
// prebuild/pretype/predev hooks. The freshness check is a pure stat walk so
// the warm path stays in the tens of milliseconds; a cold or stale dist runs
// the package's own three-entry build.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE = join(ROOT, 'packages', 'inkling')

// The published contract the root consumes: three entries × (runtime + types).
const DIST_ARTIFACTS = ['editor.js', 'core.js', 'headless.js', 'editor.d.ts', 'core.d.ts', 'headless.d.ts']

function newestMtimeMs(dir: string): number {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtimeMs(path))
    } else if (entry.isFile()) {
      newest = Math.max(newest, statSync(path).mtimeMs)
    }
  }
  return newest
}

function distIsFresh(): boolean {
  const artifacts = DIST_ARTIFACTS.map((name) => join(PACKAGE, 'dist', name))
  if (!artifacts.every((path) => existsSync(path))) {
    return false
  }
  const newestSource = newestMtimeMs(join(PACKAGE, 'src'))
  return artifacts.every((path) => statSync(path).mtimeMs >= newestSource)
}

if (distIsFresh()) {
  process.exit(0)
}

console.log('packages/inkling/dist is missing or stale — building @inkling/editor…')
// shell is REQUIRED on Windows: pnpm's .bin entries are .cmd shims only cmd.exe can run.
const result = spawnSync('pnpm', ['-F', '@inkling/editor', 'build'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
