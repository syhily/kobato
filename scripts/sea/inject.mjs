// SEA blob injection: copy the Node executable and inject the blob with
// postject. macOS (dev machines only — Linux is the delivery target)
// needs the existing signature removed before injection and an ad-hoc
// re-sign afterwards, or the kernel kills the modified arm64 binary.

import { chmod, copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import { fail, run, tryRun } from './exec.mjs'
import { repoRoot, SEA_SENTINEL_FUSE, seaBinaryPath, seaBlobPath, seaDistDir } from './paths.mjs'

function postjectPath() {
  return resolve(repoRoot, 'node_modules', '.bin', 'postject')
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

export async function runInjectStep() {
  await ensureBlobExists()
  await ensureSentinelFuse()
  await mkdir(seaDistDir(), { recursive: true })

  const out = seaBinaryPath()
  await copyFile(process.execPath, out)
  await chmod(out, 0o755)

  if (process.platform === 'darwin') {
    // Best-effort: an unsigned/ad-hoc-signed node copy has nothing to
    // remove, but a failed removal must not stop the build.
    tryRun('codesign', ['--remove-signature', out])
  }

  const args = [out, 'NODE_SEA_BLOB', seaBlobPath(), '--sentinel-fuse', SEA_SENTINEL_FUSE]
  if (process.platform === 'darwin') {
    // Node looks the blob up in the NODE_SEA Mach-O segment (postject's
    // documented default section name prefix on macOS).
    args.push('--macho-segment-name', 'NODE_SEA')
  }
  run(postjectPath(), args)

  if (process.platform === 'darwin') {
    // REQUIRED on macOS arm64: the binary was modified after signing, so
    // it must be re-signed (ad-hoc) or launchd refuses to execute it.
    run('codesign', ['--sign', '-', '--force', out])
  }
}
