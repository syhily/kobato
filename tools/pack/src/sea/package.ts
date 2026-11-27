import { seaBinaryPath, seaBinarySha256Path, seaDistDir } from '@kobato/pack/sea/paths'
import { fail } from '@kobato/test/process'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

interface CliArgs {
  command: 'rename' | 'archive'
  target: string
}

function parseArgs(): CliArgs {
  const [command, ...flags] = process.argv.slice(2)
  if (command !== 'rename' && command !== 'archive') {
    fail('Usage: node src/sea/package.ts <rename|archive> --target <target>')
  }
  const targetIndex = flags.indexOf('--target')
  const target = targetIndex !== -1 ? flags[targetIndex + 1] : undefined
  if (!target || !/^[a-z0-9]+(-[a-z0-9]+)+$/.test(target)) {
    fail(`Missing or invalid --target (expected e.g. linux-x64), got: ${target ?? 'none'}`)
  }
  return { command, target }
}

function binaryName(app: 'kobato' | 'sayaka', target: string): string {
  return process.platform === 'win32' ? `${app}-${target}.exe` : `${app}-${target}`
}

async function sha256File(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

async function writeVerifiedChecksum(artifactPath: string, sidecarPath: string, subject: string): Promise<void> {
  await writeFile(sidecarPath, `${await sha256File(artifactPath)}  ${subject}\n`)
  const sidecar = await readFile(sidecarPath, 'utf-8')
  if (sidecar.split(/\s+/)[0] !== (await sha256File(artifactPath))) {
    fail(`checksum verification failed for ${sidecarPath}`)
  }
}

async function renameBinary(target: string): Promise<void> {
  for (const app of ['kobato', 'sayaka'] as const) {
    const binaryPath = seaBinaryPath(app)
    const shaPath = seaBinarySha256Path(app)
    const sidecar = await readFile(shaPath, 'utf-8')
    const recorded = sidecar.trim().split(/\s+/)[0]
    if (recorded !== (await sha256File(binaryPath))) {
      fail(`checksum mismatch for ${binaryPath} — rebuild with pnpm run sea:build`)
    }
    const dest = join(seaDistDir(), binaryName(app, target))
    await rename(binaryPath, dest)
    await rm(shaPath)
    console.log(`==> renamed to ${dest} (build checksum verified)`)
  }
}

async function archiveBinary(target: string): Promise<void> {
  const dist = seaDistDir()

  for (const app of ['kobato', 'sayaka'] as const) {
    const binName = binaryName(app, target)
    const binPath = join(dist, binName)
    const tarName = `${app}-${target}.tar.gz`

    const tar = spawnSync('tar', ['-czf', tarName, binName], { cwd: dist })
    if (tar.error || tar.status !== 0) {
      fail(`tar failed for ${tarName}: ${tar.error?.message ?? `exit ${tar.status ?? 'unknown'}`}`)
    }

    await writeVerifiedChecksum(join(dist, tarName), `${join(dist, tarName)}.sha256`, tarName)
    await writeVerifiedChecksum(binPath, join(dist, `${app}-${target}.sha256`), binName)
    console.log(`==> packaged dist-sea/${tarName} (+ checksum sidecars)`)
  }
}

async function main(): Promise<void> {
  const args = parseArgs()
  if (args.command === 'rename') {
    await renameBinary(args.target)
  } else {
    await archiveBinary(args.target)
  }
}

await main()
