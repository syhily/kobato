#!/usr/bin/env node
//
// Aggregator that runs every local Inkling POC verifier in dependency order.
//
//   node --experimental-strip-types scripts/inkling-poc/run-all-verifiers.ts
//
// The script exits non-zero if any child verifier exits non-zero. It prints only
// aggregate status and the report paths so reviewers can scan the full evidence
// set without scrolling through per-row output.
//

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')

interface Verifier {
  name: string
  script: string
  report: string
  optional?: boolean
}

const VERIFIERS: Verifier[] = [
  {
    name: 'body-shape-inventory',
    script: 'scripts/inkling-poc/inventory-local-bodies.ts',
    report: 'tmp/inkling-poc/body-format-inventory.json',
  },
  {
    name: 'pt-to-inkling',
    script: 'scripts/inkling-poc/verify-pt-to-inkling-local-db.ts',
    report: 'tmp/inkling-poc/pt-to-inkling-report.json',
  },
  {
    name: 'derived-data-parity',
    script: 'scripts/inkling-poc/verify-derived-data-local-db.ts',
    report: 'tmp/inkling-poc/derived-data-parity-report.json',
  },
  {
    name: 'footnotes',
    script: 'scripts/inkling-poc/verify-footnotes-local-db.ts',
    report: 'tmp/inkling-poc/footnote-report.json',
  },
  {
    name: 'comment-html-cleanup',
    script: 'scripts/inkling-poc/verify-comment-html-cleanup.ts',
    report: 'tmp/inkling-poc/comment-html-cleanup-report.json',
    optional: true,
  },
]

const LOADER = 'scripts/inkling-poc/path-loader-register.mjs'

interface RunResult {
  name: string
  ok: boolean
  exitCode: number | null
  signal: NodeJS.Signals | null
  report: string
  reportExists: boolean
  optional: boolean
  error?: string
}

function runVerifier(verifier: Verifier): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(
      'node',
      ['--experimental-strip-types', '--import', join(ROOT, LOADER), join(ROOT, verifier.script)],
      {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      },
    )

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('close', (exitCode, signal) => {
      const ok = exitCode === 0
      resolve({
        name: verifier.name,
        ok,
        exitCode,
        signal,
        report: verifier.report,
        reportExists: existsSync(join(ROOT, verifier.report)),
        optional: verifier.optional === true,
      })
    })

    child.on('error', (error) => {
      resolve({
        name: verifier.name,
        ok: false,
        exitCode: null,
        signal: null,
        report: verifier.report,
        reportExists: existsSync(join(ROOT, verifier.report)),
        optional: verifier.optional === true,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  })
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.length === 0) {
    process.stderr.write('DATABASE_URL is not set; cannot run verifiers.\n')
    process.exit(1)
  }

  const results: RunResult[] = []
  for (const verifier of VERIFIERS) {
    if (verifier.optional && !existsSync(join(ROOT, verifier.script))) {
      results.push({
        name: verifier.name,
        ok: true,
        exitCode: 0,
        signal: null,
        report: verifier.report,
        reportExists: existsSync(join(ROOT, verifier.report)),
        optional: true,
      })
      continue
    }
    results.push(await runVerifier(verifier))
  }

  const hardFailures = results.filter((r) => !r.ok && !r.optional)
  const optionalFailures = results.filter((r) => !r.ok && r.optional)

  process.stdout.write('=== Inkling cutover verifier aggregate ===\n')
  for (const r of results) {
    const status = r.ok ? 'OK' : 'FAIL'
    const optionalTag = r.optional ? ' (optional)' : ''
    const reportTag = r.reportExists ? '' : ' [report missing]'
    process.stdout.write(`  ${status}${optionalTag}: ${r.name.padEnd(28)} ${r.report}${reportTag}\n`)
  }

  if (optionalFailures.length > 0) {
    process.stdout.write(
      `\nOptional verifier(s) failed or were skipped: ${optionalFailures.map((r) => r.name).join(', ')}\n`,
    )
  }

  if (hardFailures.length > 0) {
    process.stderr.write(
      `\nSTOP: ${hardFailures.length} required verifier(s) failed: ${hardFailures.map((r) => r.name).join(', ')}\n`,
    )
    process.exit(1)
  }

  process.stdout.write('\nAll required verifiers passed.\n')
}

void main()
