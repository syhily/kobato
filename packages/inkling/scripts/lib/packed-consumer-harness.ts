/* oxlint-disable no-console -- CLI helper: stdout is the output channel */
// The packed-consumer harness — the one home of the ceremony every packed
// verifier used to re-type (the failure log, the pack phase with its
// JSON-salvage parse, the throwaway-consumer scaffold, and the temp-root
// lifecycle). verify-packed-package, verify-packed-types, and
// verify-entry-sizes are adapters: they keep only their actual policy
// (assertion bodies, fixture matrices, budgets).
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

export interface CommandFailure {
  stdout?: string | Buffer
  stderr?: string | Buffer
  message?: string
}

export type ExpectedFailureResult = { failed: true; error: unknown } | { failed: false; output: string }

export interface FailureLog {
  readonly failures: { label: string; stdout?: string; stderr?: string }[]
  phase: (label: string) => void
  recordFailure: (label: string, error: CommandFailure) => void
  run: (
    label: string,
    command: string,
    args: string[],
    options?: Omit<ExecFileSyncOptionsWithStringEncoding, 'encoding'>,
  ) => string | null
  runExpectingFailure: (
    command: string,
    args: string[],
    options?: Omit<ExecFileSyncOptionsWithStringEncoding, 'encoding'>,
  ) => ExpectedFailureResult
  exitIfFailed: (label: string) => void
}

/**
 * The shared failure log: phase banners, failure recording (stderr first,
 * stdout when different, the bare message otherwise), `run` (null on
 * failure, recorded), `runExpectingFailure` (a non-zero exit is the WANTED
 * outcome — returned, never recorded), and the summary exit.
 */
export function createFailureLog(repoRoot: string): FailureLog {
  const failures: { label: string; stdout?: string; stderr?: string }[] = []

  const recordFailure = (label: string, error: CommandFailure): void => {
    const stdout = error?.stdout?.toString().trim()
    const stderr = error?.stderr?.toString().trim()
    failures.push({ label, stdout, stderr })
    console.error(`FAILED: ${label}`)
    if (stderr) {
      console.error(stderr)
    }
    if (stdout && stdout !== stderr) {
      console.error(stdout)
    }
    if (!stderr && !stdout && error?.message) {
      console.error(error.message)
    }
  }

  return {
    failures,
    phase: (label) => {
      console.log(`\n== ${label} ==`)
    },
    recordFailure,
    run(label, command, args, options = {}) {
      try {
        return execFileSync(command, args, {
          cwd: repoRoot,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
          ...options,
        })
      } catch (error) {
        recordFailure(label, error as CommandFailure)
        return null
      }
    },
    runExpectingFailure(command, args, options = {}) {
      try {
        const output = execFileSync(command, args, {
          cwd: repoRoot,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
          ...options,
        })
        return { failed: false, output }
      } catch (error) {
        return { failed: true, error }
      }
    },
    exitIfFailed(label) {
      if (failures.length > 0) {
        console.error(`\n${label} FAILED (${failures.length} phase(s)):`)
        for (const failure of failures) {
          console.error(`  - ${failure.label}`)
        }
        process.exit(1)
      }
    },
  }
}

export function makeTempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/**
 * pnpm pack into `tempRoot`. pnpm prints human output around the JSON
 * payload, so the parse salvages from the first `{`. Returns the resolved
 * tarball path and the packed file list, or null when the pack failed (the
 * failure is already recorded).
 */
export function packTarball(log: FailureLog, tempRoot: string): { tarballPath: string; files: string[] } | null {
  log.phase('pack')
  const packOutput = log.run('pnpm pack', 'pnpm', ['pack', '--pack-destination', tempRoot, '--json'])
  if (!packOutput) {
    return null
  }
  const jsonStart = packOutput.indexOf('{')
  const packJson = JSON.parse(jsonStart === -1 ? packOutput : packOutput.slice(jsonStart)) as {
    filename: string
    files?: { path: string }[]
  }
  const tarballPath = isAbsolute(packJson.filename) ? packJson.filename : join(tempRoot, packJson.filename)
  console.log(`tarball: ${packJson.filename}`)
  return { tarballPath, files: (packJson.files ?? []).map((file) => file.path) }
}

export interface ConsumerSpec {
  packageJson: Record<string, unknown>
  files?: { name: string; content: string }[]
  copies?: { from: string; to: string }[]
}

/** Scaffold a throwaway consumer project: directory, package.json, written check files, copied fixtures. */
export function scaffoldConsumer(dir: string, spec: ConsumerSpec): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(spec.packageJson, null, 2))
  for (const file of spec.files ?? []) {
    writeFileSync(join(dir, file.name), file.content)
  }
  for (const copy of spec.copies ?? []) {
    copyFileSync(copy.from, join(dir, copy.to))
  }
}
