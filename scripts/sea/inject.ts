// SEA injection: get the blob into a copy of the Node executable.
// `node --build-sea` is the only injector: it regenerates the blob from the
// sea-config (whose `output` is the FINAL binary path) and does NOT codesign
// on darwin — the modified copy must get the remove + ad-hoc re-sign treatment.

import { mkdir, readFile } from 'node:fs/promises'

import { writeSeaConfig } from './blob.ts'
import { fail, run, tryRun } from './exec.ts'
import { SEA_SENTINEL_FUSE, seaBinaryPath, seaConfigPath, seaDistDir } from './paths.ts'

/**
 * Official Node.js builds carry the SEA sentinel fuse; shared-library builds
 * (Homebrew, some distro packages) do not. Fail early with a pointer
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

function resignDarwinBinary(out: string) {
  // Best-effort removal: a failed codesign --remove must not stop the build.
  tryRun('codesign', ['--remove-signature', out])
  // REQUIRED on darwin: a modified binary must be ad-hoc re-signed or the
  // OS refuses to execute it.
  run('codesign', ['--sign', '-', '--force', out])
}

export async function runInjectStep(assets: Map<string, string>) {
  await ensureSentinelFuse()
  const out = seaBinaryPath()
  await mkdir(seaDistDir(), { recursive: true })
  // `--build-sea` builds the blob itself; `output` is the final executable path.
  await writeSeaConfig(assets, out)
  run(process.execPath, ['--build-sea', seaConfigPath()])
  if (process.platform === 'darwin') {
    resignDarwinBinary(out)
  }
  // Sanity check: the produced binary must run with zero environment.
  run(out, ['--version'])
}
