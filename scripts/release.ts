#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// --- Utilities ---

function run(cmd: string): string {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch (e: unknown) {
    const msg = e instanceof Error && 'stderr' in e ? (e.stderr as Buffer).toString().trim() : String(e)
    throw new Error(`Command failed: ${cmd}\n${msg}`)
  }
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf-8'))
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

  const pkgPath = 'package.json'
  const lockPath = 'package-lock.json'
  const composePath = 'docker-compose.yml'

  // Bump package.json
  const pkg = readJson(pkgPath)
  const oldVersion = pkg['version'] as string
  pkg['version'] = version
  writeJson(pkgPath, pkg)

  // Bump package-lock.json
  if (existsSync(resolve(ROOT, lockPath))) {
    const lock = readJson(lockPath)
    lock['version'] = version
    if (lock['packages'] && typeof lock['packages'] === 'object') {
      const packages = lock['packages'] as Record<string, Record<string, unknown>>
      if (packages['']) {
        packages['']['version'] = version
      }
    }
    writeJson(lockPath, lock)
  }

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

  const pkg = readJson('package.json')
  const version = pkg['version'] as string

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

  // Create GitHub release
  run(`gh release create "${version}" --title "Kobato ${version}" ${notesFlag} ${prerelease}`)
  process.stdout.write(`GitHub release created: https://github.com/syhily/kobato/releases/tag/${version}`)
}

function cmdPrepareNext(): void {
  const branch = getBranch()
  if (branch !== 'develop') {
    throw new Error(`Must be on develop branch. Currently on: ${branch}`)
  }

  validateClean()

  const pkgPath = 'package.json'
  const lockPath = 'package-lock.json'
  const composePath = 'docker-compose.yml'

  const pkg = readJson(pkgPath)
  const oldVersion = pkg['version'] as string
  // Strip any prerelease suffix from the old version to get the base
  const baseVersion = oldVersion.split('-')[0]
  const parts = baseVersion.split('.').map(Number)
  const nextVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}-dev`

  // Update package.json
  pkg['version'] = nextVersion
  writeJson(pkgPath, pkg)

  // Update package-lock.json
  if (existsSync(resolve(ROOT, lockPath))) {
    const lock = readJson(lockPath)
    lock['version'] = nextVersion
    if (lock['packages'] && typeof lock['packages'] === 'object') {
      const packages = lock['packages'] as Record<string, Record<string, unknown>>
      if (packages['']) {
        packages['']['version'] = nextVersion
      }
    }
    writeJson(lockPath, lock)
  }

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
