// SEA injection: get the blob into a copy of the Node executable.
//
// Per-target injector matrix (Node 26):
//
//   --build-sea  default. Verified working on linux-x64 (spike S5) and
//                re-evaluated per-target in CI on later 26.x releases.
//                Regenerates the blob itself from the sea-config (whose
//                `output` is the FINAL binary path), so no
//                `--experimental-sea-config` step runs. It does NOT
//                codesign on darwin — the output is a modified copy of
//                the (signed) building node, so darwin builds still get
//                the remove + ad-hoc re-sign treatment (spike S4). The
//                produced binary is sanity-checked with `--version`.
//   postject     darwin-x64 ONLY. `node --build-sea` SEGFAULTS there on
//                26.5.0 (spike S4: byte-identical blob, shifted Mach-O
//                `__TEXT`; upstream-untested platform, #63466-class) —
//                while the postject flow works (fuse / Mach-O segment
//                contract unchanged). Re-evaluate `--build-sea` on
//                darwin-x64 on later 26.x releases; dropping darwin-x64
//                is a separate decision.

import { chmod, copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import { writeSeaConfig } from './blob.ts'
import { fail, run, tryRun } from './exec.ts'
import { repoRoot, SEA_SENTINEL_FUSE, seaBinaryPath, seaBlobPath, seaConfigPath, seaDistDir } from './paths.ts'

type Injector = 'build-sea' | 'postject'

/** The injector for the current build host (see the header comment). Exported for the build orchestrator. */
export function selectInjector(): Injector {
  return process.platform === 'darwin' && process.arch === 'x64' ? 'postject' : 'build-sea'
}

function postjectPath() {
  const bin = resolve(repoRoot, 'node_modules', '.bin', 'postject')
  // The .bin entry is a .cmd shim on Windows (run through the shell —
  // see exec.ts); on POSIX it is an executable script directly.
  return process.platform === 'win32' ? `${bin}.cmd` : bin
}

async function ensureBlobExists() {
  try {
    await stat(seaBlobPath())
  } catch {
    fail(`SEA blob not found at ${seaBlobPath()}. Run the blob step first.`)
  }
}

/**
 * postject can only patch binaries that carry the SEA sentinel fuse.
 * Official Node.js builds (nodejs.org, actions/setup-node) have it;
 * shared-library builds (Homebrew, some distro packages) do not — their
 * `node` is a tiny launcher against libnode. Fail early with a pointer
 * instead of surfacing postject's raw "sentinel not found" error.
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

async function injectWithBuildSea(assets: Map<string, string>) {
  const out = seaBinaryPath()
  await mkdir(seaDistDir(), { recursive: true })
  // `--build-sea` builds the blob itself; the config's `output` is the
  // final executable path (the `executable` field stays at its default —
  // the building node).
  await writeSeaConfig(assets, out)
  run(process.execPath, ['--build-sea', seaConfigPath()])
  if (process.platform === 'darwin') {
    resignDarwinBinary(out)
  }
  // Sanity check: the produced binary must run with zero environment.
  run(out, ['--version'])
}

async function injectWithPostject() {
  await ensureBlobExists()
  await ensureSentinelFuse()
  await mkdir(seaDistDir(), { recursive: true })

  const out = seaBinaryPath()
  await copyFile(process.execPath, out)
  await chmod(out, 0o755)

  tryRun('codesign', ['--remove-signature', out])

  // Node looks the blob up in the NODE_SEA Mach-O segment (postject's
  // documented default section name prefix on macOS).
  run(postjectPath(), [
    out,
    'NODE_SEA_BLOB',
    seaBlobPath(),
    '--sentinel-fuse',
    SEA_SENTINEL_FUSE,
    '--macho-segment-name',
    'NODE_SEA',
  ])

  run('codesign', ['--sign', '-', '--force', out])
}

export async function runInjectStep(assets: Map<string, string>) {
  if (selectInjector() === 'build-sea') {
    await injectWithBuildSea(assets)
    return
  }
  await injectWithPostject()
}
