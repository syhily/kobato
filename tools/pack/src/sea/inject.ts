import { fail } from '@kobato/instance/process'
import { writeSeaConfig } from '@kobato/pack/sea/blob'
import { run, tryRun } from '@kobato/pack/sea/exec'
import { SEA_SENTINEL_FUSE, seaBinaryPath, seaConfigPath, seaDistDir, type SeaApp } from '@kobato/pack/sea/paths'
import { mkdir, readFile } from 'node:fs/promises'

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
  tryRun('codesign', ['--remove-signature', out])
  run('codesign', ['--sign', '-', '--force', out])
}

export async function runInjectStep(assets: Map<string, string>, app: SeaApp = 'kobato') {
  await ensureSentinelFuse()
  const out = seaBinaryPath(app)
  await mkdir(seaDistDir(), { recursive: true })
  await writeSeaConfig(app, assets, out)
  run(process.execPath, ['--build-sea', seaConfigPath(app)])
  if (process.platform === 'darwin') {
    resignDarwinBinary(out)
  }
  run(out, ['--version'])
}
