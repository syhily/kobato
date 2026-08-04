#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// --- Utilities ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function run(cmd: string): string {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch (e: unknown) {
    const msg =
      e instanceof Error && 'stderr' in e && e.stderr instanceof Buffer ? e.stderr.toString().trim() : String(e)
    throw new Error(`Command failed: ${cmd}\n${msg}`)
  }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf-8'))
}

function requireString(obj: unknown, key: string): string {
  if (!isRecord(obj) || typeof obj[key] !== 'string') {
    throw new Error(`Missing or invalid ${key}`)
  }
  return obj[key]
}

function writeJson(path: string, data: Record<string, unknown>): void {
  writeFileSync(resolve(ROOT, path), JSON.stringify(data, null, 2) + '\n')
}

function validateClean(): void {
  const status = run('git status --porcelain')
  if (status) {
    throw new Error('Working tree is not clean. Commit or stash changes first.')
  }
}

function getBranch(): string {
  return run('git branch --show-current')
}

// --- Commands ---

function cmdSinceLast(): void {
  const tag = run('git describe --tags --abbrev=0')
  process.stdout.write(tag)
}

function cmdBump(version: string): void {
  if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    throw new Error(`Invalid version: ${version}. Expected semver format like 6.3.0 or 6.3.0-beta.1.`)
  }

  validateClean()

  // Version is owned by the core app's package.json (monorepo split,
  // stage 2 §8) — the workspace root no longer carries a release version.
  const pkgPath = 'apps/core/package.json'
  const lockPath = 'pnpm-lock.yaml'
  const composePath = 'docker-compose.yml'

  // Bump package.json
  const pkg = readJson(pkgPath)
  if (!isRecord(pkg)) {
    throw new Error('Invalid package.json')
  }
  const oldVersion = requireString(pkg, 'version')
  pkg['version'] = version
  writeJson(pkgPath, pkg)

  // Update docker-compose.yml image tag
  if (existsSync(resolve(ROOT, composePath))) {
    let compose = readFileSync(resolve(ROOT, composePath), 'utf-8')
    compose = compose.replace(/ghcr\.io\/syhily\/kobato:[^\s]+/, `ghcr.io/syhily/kobato:${version}`)
    writeFileSync(resolve(ROOT, composePath), compose)
  }

  // Stage and commit
  run(`git add ${pkgPath} ${lockPath} ${composePath}`)
  run(`git commit -m "build: release ${version}"`)

  process.stdout.write(`${oldVersion} -> ${version}`)
}

function cmdTag(args: string[]): void {
  const branch = getBranch()
  if (branch !== 'main') {
    throw new Error(`Must be on main branch to tag. Currently on: ${branch}`)
  }

  validateClean()

  const pkg = readJson('apps/core/package.json')
  if (!isRecord(pkg)) {
    throw new Error('Invalid package.json')
  }
  const version = requireString(pkg, 'version')

  // Check tag doesn't already exist
  const tags = run('git tag --list').split('\n')
  if (tags.includes(version)) {
    throw new Error(`Tag ${version} already exists.`)
  }

  // Verify gh CLI is available
  try {
    run('gh --version')
  } catch {
    throw new Error('gh CLI is required. Install from https://cli.github.com/')
  }

  // Resolve notes file (agent writes release notes here)
  const notesIndex = args.indexOf('--notes-file')
  const notesFile = notesIndex !== -1 && args[notesIndex + 1] ? args[notesIndex + 1] : null
  const notesFlag = notesFile && existsSync(notesFile) ? `--notes-file "${notesFile}"` : '--notes ""'

  const prerelease = args.includes('--prerelease') ? '--prerelease' : ''

  // Create annotated tag
  run(`git tag -a "${version}" -m "Kobato ${version}"`)
  process.stdout.write(`Created tag ${version}\n`)

  // Push tag
  run(`git push origin "${version}"`)
  process.stdout.write(`Pushed tag ${version}\n`)

  // Create the GitHub release as a DRAFT: sea.yml uploads the SEA assets
  // asynchronously, and only publishes (gh release edit --draft=false)
  // after every binary is attached — users must never see a release with
  // missing assets. If the upload fails, the draft stays for manual fixing.
  run(`gh release create "${version}" --draft --title "Kobato ${version}" ${notesFlag} ${prerelease}`)
  process.stdout.write(
    `GitHub draft release created: https://github.com/syhily/kobato/releases/tag/${version}\n` +
      `It stays a draft until sea.yml finishes uploading the SEA assets.\n`,
  )

  cmdPublishSdk()
}

/**
 * The npm publish step for `@kobato/sdk` — the only published package in
 * the workspace (stage 3 §1). The tag flow builds the SDK and verifies
 * `npm publish --dry-run` passes; the actual `npm publish` stays a
 * manual/CI action (the release can still be aborted while the SEA assets
 * upload). The SDK's version follows the Content API contract (1.x ↔
 * `/api/content/v1`) and is bumped independently of the core release
 * version.
 */
function cmdPublishSdk(): void {
  process.stdout.write('\n── @kobato/sdk npm publish (dry-run) ──\n')

  const sdkPkg = readJson('packages/sdk/package.json')
  if (!isRecord(sdkPkg) || typeof sdkPkg['version'] !== 'string') {
    throw new Error('packages/sdk/package.json is missing a version')
  }
  const sdkVersion = sdkPkg['version']

  run('pnpm --filter @kobato/sdk build')
  process.stdout.write(`SDK ${sdkVersion} built (packages/sdk/dist/). Verifying publish dry-run…\n`)

  // Prerelease versions (e.g. `1.0.0-dev`) require an explicit dist-tag.
  const tagFlag = sdkVersion.includes('-') ? '--tag next' : ''

  // `npm publish <folder> --dry-run` packs exactly what `files` declares
  // and validates the exports map without touching the registry.
  run(`npm publish ./packages/sdk --dry-run ${tagFlag}`.trim())

  process.stdout.write(
    `@kobato/sdk@${sdkVersion} dry-run passed.\n` +
      `To publish: cd packages/sdk && npm publish\n` +
      `(the actual publish stays manual/CI — bump the sdk version in ` +
      `packages/sdk/package.json when the Content API contract changes)\n`,
  )
}

function cmdPrepareNext(): void {
  const branch = getBranch()
  if (branch !== 'develop') {
    throw new Error(`Must be on develop branch. Currently on: ${branch}`)
  }

  validateClean()

  // Version is owned by the core app's package.json (monorepo split,
  // stage 2 §8) — the workspace root no longer carries a release version.
  const pkgPath = 'apps/core/package.json'
  const lockPath = 'pnpm-lock.yaml'
  const composePath = 'docker-compose.yml'

  const pkg = readJson(pkgPath)
  if (!isRecord(pkg)) {
    throw new Error('Invalid package.json')
  }
  const oldVersion = requireString(pkg, 'version')
  // Strip any prerelease suffix from the old version to get the base
  const baseVersion = oldVersion.split('-')[0]
  const parts = baseVersion.split('.').map(Number)
  const nextVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}-dev`

  // Update package.json
  pkg['version'] = nextVersion
  writeJson(pkgPath, pkg)

  // Update docker-compose.yml to latest
  if (existsSync(resolve(ROOT, composePath))) {
    let compose = readFileSync(resolve(ROOT, composePath), 'utf-8')
    compose = compose.replace(/ghcr\.io\/syhily\/kobato:[^\s]+/, 'ghcr.io/syhily/kobato:latest')
    writeFileSync(resolve(ROOT, composePath), compose)
  }

  // Stage and commit
  run(`git add ${pkgPath} ${lockPath} ${composePath}`)
  run(`git commit -m "chore: prepare next development cycle"`)

  process.stdout.write(`Prepared ${nextVersion} on develop (from ${oldVersion})`)
}

// --- Main ---

const [, , command, ...args] = process.argv

const commands: Record<string, (args: string[]) => void> = {
  'since-last': () => cmdSinceLast(),
  bump: (args) => cmdBump(args[0]),
  tag: (args) => cmdTag(args),
  'prepare-next': () => cmdPrepareNext(),
}

if (!command || !commands[command]) {
  process.stderr.write('Usage: node scripts/release.ts <command> [args]\n')
  process.stderr.write(`Commands: ${Object.keys(commands).join(', ')}\n`)
  process.exit(1)
}

try {
  commands[command](args)
} catch (e: unknown) {
  process.stderr.write(`\x1b[31m${e instanceof Error ? e.message : String(e)}\x1b[0m\n`)
  process.exit(1)
}
