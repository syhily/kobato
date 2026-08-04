// SEA injection: get the blob into a copy of the Node executable.
//
// `node --build-sea` is the only injector. Verified working on linux-x64
// (spike S5) and re-evaluated per-target in CI on later 26.x releases.
// It regenerates the blob itself from the sea-config (whose `output` is
// the FINAL binary path), so no `--experimental-sea-config` step runs.
// It does NOT codesign on darwin — the output is a modified copy of the
// (signed) building node, so darwin builds still get the remove + ad-hoc
// re-sign treatment (spike S4). The produced binary is sanity-checked
// with `--version`.
//
// postject was retired together with the darwin-x64 target (the only
// platform where `--build-sea` segfaulted on 26.5.0, #63466-class).

import { mkdir, readFile } from 'node:fs/promises'

import type { SeaTarget } from './target.ts'

import { writeSeaConfig } from './blob.ts'
import { fail, run, tryRun } from './exec.ts'
import { SEA_SENTINEL_FUSE, seaBinaryPath, seaConfigPath, seaDistDir } from './paths.ts'

/**
 * `--build-sea` can only patch binaries that carry the SEA sentinel fuse.
 * Official Node.js builds (nodejs.org, actions/setup-node) have it;
 * shared-library builds (Homebrew, some distro packages) do not — their
 * `node` is a tiny launcher against libnode. Fail early with a pointer
 * instead of surfacing the injector's raw "sentinel not found" error.
 */
async function ensureSentinelFuse() {
  const binary = await readFile(process.execPath)
  if (!binary.includes(SEA_SENTINEL_FUSE)) {
    fail(
      [
        `The Node.js executable at ${process.execPath} does not contain the SEA sentinel fuse.`,
        'Single-executable builds require an official Node.js distribution (nodejs.org or',
        'actions/setup-node). Homebrew and other shared-library builds are not supported.',
      ].join('\n'),
    )
  }
}

/** `--build-sea` does not codesign on darwin — remove the (now-invalid) signature and re-sign ad-hoc. */
function resignDarwinBinary(out: string) {
  // Best-effort removal: an unsigned/ad-hoc-signed binary has nothing to
  // remove, but a failed removal must not stop the build.
  tryRun('codesign', ['--remove-signature', out])
  // REQUIRED on darwin: the binary was modified after signing, so it must
  // be re-signed (ad-hoc) or the kernel/launchd refuses to execute it.
  run('codesign', ['--sign', '-', '--force', out])
}

export async function runInjectStep(assets: Map<string, string>, target: SeaTarget = 'core') {
  await ensureSentinelFuse()
  const out = seaBinaryPath(target)
  await mkdir(seaDistDir(), { recursive: true })
  // `--build-sea` builds the blob itself; the config's `output` is the
  // final executable path (the `executable` field stays at its default —
  // the building node).
  await writeSeaConfig(assets, out, target)
  run(process.execPath, ['--build-sea', seaConfigPath(target)])
  if (process.platform === 'darwin') {
    resignDarwinBinary(out)
  }
  // Sanity check: the produced binary must run with zero environment.
  run(out, ['--version'])
}
