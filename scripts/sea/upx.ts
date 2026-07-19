// UPX compression for the injected SEA binary (delivery targets: linux
// x64/arm64). UPX shrinks the ~200 MB executable substantially; the kernel
// decompresses it in memory at exec, so runtime behavior is unchanged apart
// from a slightly slower start — irrelevant for a long-running server, and
// the self-updater's download (plans/090) gets proportionally smaller.
//
// Runs after postject injection and BEFORE the sha256 checksum
// (scripts/sea/build.ts), so the published checksum always matches the
// compressed artifact.
//
// Skips — with a log line, never a failure — when:
//   - `SEA_UPX=0`         — explicit opt-out
//   - platform ≠ linux    — macOS builds are dev-only; UPX's Mach-O support
//                           is flaky and the binary is not a delivery target
//   - `upx` not on PATH   — local builds stay uncompressed; CI installs
//                           upx-ucl explicitly (.github/workflows/sea.yml),
//                           so release assets are always compressed
//
// `SEA_UPX_REQUIRE=1` flips the not-found skip into a hard failure — the
// Dockerfile sets it so a broken UPX install can never silently ship an
// uncompressed image again.
//
// Overrides: `SEA_UPX_BIN` (binary path), `SEA_UPX_ARGS` (flags, default
// `--best`).

import { spawnSync } from 'node:child_process'
import { stat } from 'node:fs/promises'

import { fail, run } from './exec.ts'

const DEFAULT_UPX_ARGS = ['--best']

function resolveUpxBinary(): string | null {
  const bin = process.env.SEA_UPX_BIN ?? 'upx'
  const probe = spawnSync(bin, ['--version'], { stdio: 'ignore' })
  return probe.error === undefined && probe.status === 0 ? bin : null
}

function resolveUpxArgs(): string[] {
  const override = process.env.SEA_UPX_ARGS
  if (override !== undefined && override.trim() !== '') {
    return override.trim().split(/\s+/)
  }
  return DEFAULT_UPX_ARGS
}

function toMb(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1)
}

export async function maybeCompressWithUpx(binaryPath: string) {
  if (process.env.SEA_UPX === '0') {
    console.log('==> UPX compression skipped (SEA_UPX=0)')
    return
  }
  if (process.platform !== 'linux') {
    console.log('==> UPX compression skipped (linux-only; dev builds stay uncompressed)')
    return
  }
  const upx = resolveUpxBinary()
  if (upx === null) {
    if (process.env.SEA_UPX_REQUIRE === '1') {
      fail('upx is required (SEA_UPX_REQUIRE=1) but was not found on PATH.')
    }
    console.warn('==> upx not found — skipping compression (install upx-ucl to shrink the binary)')
    return
  }

  const beforeStat = await stat(binaryPath)
  run(upx, [...resolveUpxArgs(), binaryPath])
  const afterStat = await stat(binaryPath)
  const before = beforeStat.size
  const after = afterStat.size
  console.log(`    UPX: ${toMb(before)} MB → ${toMb(after)} MB (${Math.round((after / before) * 100)}%)`)
}
