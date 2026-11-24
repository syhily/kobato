import { spawn } from 'node:child_process'
import { existsSync, globSync, mkdirSync, readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

function workspaceGlobs(): string[] {
  const lines = readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8').split('\n')
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line))
  if (start === -1) {
    return []
  }
  const globs: string[] = []
  for (const line of lines.slice(start + 1)) {
    const match = /^\s+-\s+['"]?([^'"\s]+)['"]?\s*$/.exec(line)
    if (match === null) {
      break
    }
    globs.push(match[1]!)
  }
  return globs
}

function typecheckProjects(): string[] {
  const dirs = new Set(
    workspaceGlobs().flatMap((pattern) => globSync(pattern, { cwd: REPO_ROOT, exclude: ['**/node_modules/**'] })),
  )
  return [...dirs, '.']
    .filter(
      (dir) => existsSync(join(REPO_ROOT, dir, 'package.json')) && existsSync(join(REPO_ROOT, dir, 'tsconfig.json')),
    )
    .sort()
}

const projects = typecheckProjects()
const tsc = join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc')
const cacheDir = join(REPO_ROOT, 'node_modules', '.cache', 'typecheck')
const concurrency = Math.max(2, Math.floor(availableParallelism() / 6))
const failures: Array<{ project: string; output: string }> = []
let next = 0

function runNext(): Promise<void> {
  if (next === projects.length) {
    return Promise.resolve()
  }
  const project = projects[next++]!
  const started = Date.now()
  return new Promise((resolve) => {
    const name = project === '.' ? 'root' : project.replaceAll('/', '__')
    const child = spawn(
      tsc,
      [
        '--noEmit',
        '--incremental',
        '--tsBuildInfoFile',
        join(cacheDir, `${name}.tsbuildinfo`),
        '-p',
        join(REPO_ROOT, project, 'tsconfig.json'),
      ],
      {
        cwd: REPO_ROOT,
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let output = ''
    const collect = (chunk: Buffer): void => {
      output += chunk.toString()
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('close', (code) => {
      if (code !== 0) {
        failures.push({ project, output: output.trim() })
      }
      process.stdout.write(`${code === 0 ? 'ok  ' : 'FAIL'} ${project} (${Date.now() - started}ms)\n`)
      resolve(runNext())
    })
  })
}

const started = Date.now()
mkdirSync(cacheDir, { recursive: true })
await Promise.all(Array.from({ length: Math.min(concurrency, projects.length) }, runNext))

if (failures.length > 0) {
  const isDiagnostic = (line: string): boolean => line === '' || /error TS\d+/.test(line)
  const diagnostics = new Set(failures.flatMap(({ output }) => output.split('\n').filter(isDiagnostic)))
  process.stdout.write(`\n${[...diagnostics].join('\n')}\n`)
  for (const { project, output } of failures) {
    const rest = output.split('\n').filter((line) => !isDiagnostic(line))
    if (rest.length > 0) {
      process.stdout.write(`\n${project}\n${rest.join('\n')}\n`)
    }
  }
}
const seconds = ((Date.now() - started) / 1000).toFixed(1)
process.stdout.write(
  failures.length === 0
    ? `typecheck: ${projects.length} projects passed in ${seconds}s\n`
    : `typecheck: ${failures.length} of ${projects.length} projects failed in ${seconds}s\n`,
)
process.exit(failures.length === 0 ? 0 : 1)
