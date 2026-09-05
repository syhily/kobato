#!/usr/bin/env node
// Skip sentinel: every test.skip/describe.skip/it.todo in the e2e and unit
// suites must carry a SKIP-REASON justification (on the same line or the line
// directly above) so new skips can't become invisible. Invoked from `pnpm lint`.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const DIRS = ['test/e2e', 'test/unit']

// grep exits 1 when nothing matches — that is the clean case, not an error
function isGrepNoMatch(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 1
}

let grepOutput = ''
try {
  grepOutput = execSync(`grep -rnE "\\.(skip|todo)\\(" ${DIRS.join(' ')} --include='*.ts' --include='*.tsx'`, {
    encoding: 'utf8',
  })
} catch (error) {
  if (isGrepNoMatch(error)) {
    process.exit(0) // no matches at all
  }
  throw error
}

const fileCache = new Map<string, string[]>()
const offenders: string[] = []

for (const line of grepOutput.split('\n').filter(Boolean)) {
  const match = line.match(/^([^:]+):(\d+):(.*)$/)
  if (!match) {
    continue
  }
  const [, file, lineNumber, content] = match
  if (content.includes('SKIP-REASON')) {
    continue
  }
  let lines = fileCache.get(file)
  if (!lines) {
    lines = readFileSync(file, 'utf8').split('\n')
    fileCache.set(file, lines)
  }
  const lineAbove = lines[Number(lineNumber) - 2] ?? ''
  if (!lineAbove.includes('SKIP-REASON')) {
    offenders.push(`${file}:${lineNumber}`)
  }
}

if (offenders.length > 0) {
  console.error('Unjustified test skips found — add a SKIP-REASON comment (same line or line above):')
  for (const offender of offenders) {
    console.error(`  ${offender}`)
  }
  process.exit(1)
}
