import { fail } from '@kobato/pack/sea/exec'
import { repoRoot, seaBinaryPath, seaBinarySha256Path, seaDistDir } from '@kobato/pack/sea/paths'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

interface CliArgs {
  command: 'rename' | 'archive'
  target: string
  deb: boolean
}

function parseArgs(): CliArgs {
  const [command, ...flags] = process.argv.slice(2)
  if (command !== 'rename' && command !== 'archive') {
    fail('Usage: node src/sea/package.ts <rename|archive> --target <target> [--deb]')
  }
  const targetIndex = flags.indexOf('--target')
  const target = targetIndex !== -1 ? flags[targetIndex + 1] : undefined
  if (!target || !/^[a-z0-9]+(-[a-z0-9]+)+$/.test(target)) {
    fail(`Missing or invalid --target (expected e.g. linux-x64), got: ${target ?? 'none'}`)
  }
  return { command, target, deb: flags.includes('--deb') }
}

function binaryName(target: string): string {
  return process.platform === 'win32' ? `kobato-${target}.exe` : `kobato-${target}`
}

async function sha256File(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

// Mirrors the `sha256sum -c` / `shasum -a 256 -c` belt-and-braces the CI shell
// steps used to run: write the sidecar, then re-read it against a fresh hash.
async function writeVerifiedChecksum(artifactPath: string, sidecarPath: string, subject: string): Promise<void> {
  await writeFile(sidecarPath, `${await sha256File(artifactPath)}  ${subject}\n`)
  const sidecar = await readFile(sidecarPath, 'utf-8')
  if (sidecar.split(/\s+/)[0] !== (await sha256File(artifactPath))) {
    fail(`checksum verification failed for ${sidecarPath}`)
  }
}

// build-deb.sh prints the resulting .deb path on stdout; exec.run inherits stdio.
function capture(command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf-8' })
  if (result.error || result.status !== 0) {
    fail(`Command failed: ${command} ${args.join(' ')}`)
  }
  return result.stdout.trim()
}

async function renameBinary(target: string): Promise<void> {
  const shaPath = seaBinarySha256Path()
  const sidecar = await readFile(shaPath, 'utf-8')
  const recorded = sidecar.trim().split(/\s+/)[0]
  if (recorded !== (await sha256File(seaBinaryPath()))) {
    fail(`checksum mismatch for ${seaBinaryPath()} — rebuild with pnpm run sea:build`)
  }
  const dest = join(seaDistDir(), binaryName(target))
  await rename(seaBinaryPath(), dest)
  await rm(shaPath)
  console.log(`==> renamed to ${dest} (build checksum verified)`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function readAppVersion(): Promise<string> {
  const pkg: unknown = JSON.parse(await readFile(join(repoRoot, 'apps/kobato/package.json'), 'utf-8'))
  const version = isRecord(pkg) ? pkg.version : undefined
  if (typeof version !== 'string') {
    fail('Missing version in apps/kobato/package.json')
  }
  return version
}

async function archiveBinary(target: string, deb: boolean): Promise<void> {
  const dist = seaDistDir()
  const binName = binaryName(target)
  const binPath = join(dist, binName)
  const tarName = `kobato-${target}.tar.gz`

  // tar must run with cwd inside dist-sea so archive members carry the bare
  // binary name, not the absolute path.
  const tar = spawnSync('tar', ['-czf', tarName, binName], { cwd: dist })
  if (tar.error || tar.status !== 0) {
    fail(`tar failed for ${tarName}: ${tar.error?.message ?? `exit ${tar.status ?? 'unknown'}`}`)
  }

  await writeVerifiedChecksum(join(dist, tarName), `${join(dist, tarName)}.sha256`, tarName)
  await writeVerifiedChecksum(binPath, join(dist, `kobato-${target}.sha256`), binName)
  console.log(`==> packaged dist-sea/${tarName} (+ checksum sidecars)`)

  if (deb) {
    const version = await readAppVersion()
    const debName = basename(capture('bash', ['scripts/build-deb.sh', join('dist-sea', binName), version, 'dist-sea']))
    const debPath = join(dist, debName)
    await writeVerifiedChecksum(debPath, `${debPath}.sha256`, debName)
    console.log(`==> packaged dist-sea/${debName} (+ checksum sidecar)`)
  }
}

async function main(): Promise<void> {
  const args = parseArgs()
  if (args.command === 'rename') {
    await renameBinary(args.target)
  } else {
    await archiveBinary(args.target, args.deb)
  }
}

await main()
