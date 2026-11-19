#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..', '..')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function run(cmd: string): string {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch (e: unknown) {
    const msg =
      e instanceof Error && 'stderr' in e && e.stderr instanceof Buffer ? e.stderr.toString().trim() : String(e)
    throw new Error(`Command failed: ${cmd}\n${msg}`, { cause: e })
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

function workspacePackagePaths(): string[] {
  const paths: string[] = []
  const collect = (base: string, nest: number): void => {
    for (const entry of readdirSync(resolve(ROOT, base), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') {
        continue
      }
      const dir = `${base}/${entry.name}`
      if (existsSync(resolve(ROOT, dir, 'package.json'))) {
        paths.push(`${dir}/package.json`)
      } else if (nest > 0) {
        collect(dir, nest - 1)
      }
    }
  }
  for (const base of ['apps', 'packages', 'tools']) {
    collect(base, 1)
  }
  return paths.sort()
}

function syncWorkspaceVersions(version: string): { oldVersion: string; paths: string[] } {
  const source = readJson('apps/kobato/package.json')
  if (!isRecord(source)) {
    throw new Error('Invalid apps/kobato/package.json')
  }
  const oldVersion = requireString(source, 'version')
  const paths = workspacePackagePaths()
  for (const path of paths) {
    const pkg = readJson(path)
    if (!isRecord(pkg)) {
      throw new Error(`Invalid ${path}`)
    }
    pkg.version = version
    writeJson(path, pkg)
  }
  return { oldVersion, paths }
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

function cmdSinceLast(): void {
  const tag = run('git describe --tags --abbrev=0')
  process.stdout.write(tag)
}

function assertVersion(version: string): void {
  if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    throw new Error(`Invalid version: ${version}. Expected semver format like 6.3.0 or 6.3.0-beta.1.`)
  }
}

function cmdBump(version: string): void {
  assertVersion(version)

  validateClean()

  const lockPath = 'pnpm-lock.yaml'
  const { oldVersion, paths } = syncWorkspaceVersions(version)

  run(`git add ${[...paths, lockPath].join(' ')}`)
  run(`git commit -m "build: release ${version}"`)

  process.stdout.write(`${oldVersion} -> ${version}`)
}

function cmdSyncVersions(version: string): void {
  assertVersion(version)
  const { oldVersion, paths } = syncWorkspaceVersions(version)
  process.stdout.write(`Synchronized ${paths.length} workspace packages: ${oldVersion} -> ${version}`)
}

function cmdTag(args: string[]): void {
  const branch = getBranch()
  if (branch !== 'main') {
    throw new Error(`Must be on main branch to tag. Currently on: ${branch}`)
  }

  validateClean()

  const pkg = readJson('apps/kobato/package.json')
  if (!isRecord(pkg)) {
    throw new Error('Invalid package.json')
  }
  const version = requireString(pkg, 'version')

  const tags = run('git tag --list').split('\n')
  if (tags.includes(version)) {
    throw new Error(`Tag ${version} already exists.`)
  }

  try {
    run('gh --version')
  } catch {
    throw new Error('gh CLI is required. Install from https://cli.github.com/')
  }

  const notesIndex = args.indexOf('--notes-file')
  const notesFile = notesIndex !== -1 && args[notesIndex + 1] ? args[notesIndex + 1] : null
  const notesFlag = notesFile && existsSync(notesFile) ? `--notes-file "${notesFile}"` : '--notes ""'

  const prerelease = args.includes('--prerelease') ? '--prerelease' : ''

  run(`git tag -a "${version}" -m "Kobato ${version}"`)
  process.stdout.write(`Created tag ${version}\n`)

  run(`git push origin "${version}"`)
  process.stdout.write(`Pushed tag ${version}\n`)

  run(`gh release create "${version}" --draft --title "Kobato ${version}" ${notesFlag} ${prerelease}`)
  process.stdout.write(
    `GitHub draft release created: https://github.com/syhily/kobato/releases/tag/${version}\n` +
      `It stays a draft until sea.yml finishes uploading the SEA assets.`,
  )
}

function cmdPrepareNext(version?: string): void {
  const branch = getBranch()
  if (branch !== 'develop') {
    throw new Error(`Must be on develop branch. Currently on: ${branch}`)
  }

  validateClean()

  const lockPath = 'pnpm-lock.yaml'

  const pkg = readJson('apps/kobato/package.json')
  if (!isRecord(pkg)) {
    throw new Error('Invalid package.json')
  }
  const oldVersion = requireString(pkg, 'version')
  let nextVersion: string
  if (version) {
    assertVersion(version)
    nextVersion = version
  } else {
    const baseVersion = oldVersion.split('-')[0]
    const parts = baseVersion.split('.').map(Number)
    nextVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}-dev`
  }

  const { paths } = syncWorkspaceVersions(nextVersion)
  run(`git add ${[...paths, lockPath].join(' ')}`)
  run(`git commit -m "chore: prepare next development cycle"`)

  process.stdout.write(`Prepared ${nextVersion} on develop (from ${oldVersion})`)
}

const [, , command, ...args] = process.argv

const commands: Record<string, (args: string[]) => void> = {
  'since-last': () => cmdSinceLast(),
  bump: (args) => cmdBump(args[0]),
  tag: (args) => cmdTag(args),
  'prepare-next': (args) => cmdPrepareNext(args[0]),
  'sync-versions': (args) => cmdSyncVersions(args[0]),
}

if (!command || !commands[command]) {
  process.stderr.write('Usage: node tools/pack/src/release.ts <command> [args]\n')
  process.stderr.write(`Commands: ${Object.keys(commands).join(', ')}\n`)
  process.exit(1)
}

try {
  commands[command](args)
} catch (e: unknown) {
  process.stderr.write(`\x1b[31m${e instanceof Error ? e.message : String(e)}\x1b[0m\n`)
  process.exit(1)
}
