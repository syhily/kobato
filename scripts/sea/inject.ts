// SEA injection: get the blob into a copy of the Node executable.
// `node --build-sea` is the only injector, and it does not codesign on darwin,
// so the modified copy must be re-signed ad-hoc afterwards.

import { mkdir, readFile } from 'node:fs/promises'

import { writeSeaConfig } from './blob.ts'
import { fail, run, tryRun } from './exec.ts'
import { SEA_SENTINEL_FUSE, seaBinaryPath, seaConfigPath, seaDistDir } from './paths.ts'

/**
 * Official Node.js builds carry the sentinel fuse; shared-library builds
 * (Homebrew, some distro packages) do not.
 * A universal binary carries one sentinel per slice, which `--build-sea`
 * also rejects.
 */
async function ensureSentinelFuse() {
  const binary = await readFile(process.execPath)
  let occurrences = 0
  for (
    let index = binary.indexOf(SEA_SENTINEL_FUSE);
    index !== -1;
    index = binary.indexOf(SEA_SENTINEL_FUSE, index + 1)
  ) {
    occurrences += 1
  }
  if (occurrences === 0) {
    fail(
      [
        `The Node.js executable at ${process.execPath} does not contain the SEA sentinel fuse.`,
        'Single-executable builds require an official Node.js distribution (nodejs.org or',
        'actions/setup-node). Homebrew and other shared-library builds are not supported.',
      ].join('\n'),
    )
  }
  if (occurrences > 1) {
    fail(
      [
        `The Node.js executable at ${process.execPath} contains ${occurrences} SEA sentinel fuses.`,
        'node --build-sea accepts exactly one — a universal/multi-architecture binary carries one',
        'per slice. Run the build with a single-architecture official Node.js distribution',
        '(for example node-v26.13.1-darwin-x64/bin/node on an Intel Mac).',
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
  await writeSeaConfig(assets, out)
  run(process.execPath, ['--build-sea', seaConfigPath()])
  if (process.platform === 'darwin') {
    resignDarwinBinary(out)
  }
  run(out, ['--version'])
}
