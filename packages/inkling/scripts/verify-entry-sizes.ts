#!/usr/bin/env node
/* oxlint-disable no-console -- CLI script: stdout is its output channel */
// Entry-size gate (plan C5 §5): measures the real gzip weight of every
// published entry with Node's zlib and asserts the split-entry budgets, so
// the `./core` subpath can't silently regress toward the full bundle (and
// the `.` entry can't silently grow). Prints the full table for review.
// Invoked from `pnpm verify:sizes` (CI `package` job) after `pnpm build`.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { createFailureLog } from './lib/packed-consumer-harness.ts'

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const log = createFailureLog(DIST)

const KB = 1024

// Budgets (gzip bytes), set from the first dual-entry build's real
// measurements per the C5 plan's rules:
// - editor.js: the plan's absolute 680KB cap (baseline + ~2.5%). The plan's
//   664KB baseline was measured before the C4 chapters landed; the real
//   pre-split baseline was 687.5KB, and the split itself moved yjs out of the
//   entry, bringing the entry to 660.2KB — the 680KB cap keeps ~3% headroom
//   over that real post-split measurement.
// - core.js: "first measurement + 5%" — measured 232.4KB gzip on the first
//   dual build, so the budget is 245KB.
// - entry diff: the split must really carve the cards/collab/emoji mass out
//   of core — measured 427.8KB on the first build.
// - collaboration chunks: the lazy collaboration surface is TWO chunks per
//   entry (rolldown factors the shared yjs/y-websocket runtime out of the
//   direct dynamic-import chunk): ~3.7KB + ~26.3KB gzip on the first build.
//   The plan's 120KB single-chunk cap is applied per chunk.
//
// Budget note (C4c): the table cell guard sits on the core path
// (InklingBehaviourPlugin → default-transforms → table-cell-guard), so the
// @lexical/table runtime (~16KB gzip) is part of the core floor by design —
// not lazily loaded.
const BUDGETS = {
  editor: 680 * KB,
  core: 245 * KB,
  entryDiffMin: 250 * KB,
  collabChunk: 120 * KB,
} as const

interface EntrySize {
  file: string
  min: number
  gzip: number
}

function measure(relativePath: string): EntrySize {
  const body = readFileSync(join(DIST, relativePath))
  return { file: relativePath, min: body.length, gzip: gzipSync(body).length }
}

function formatKB(bytes: number): string {
  return `${(bytes / KB).toFixed(1)}KB`
}

function expectBudget(label: string, actual: number, budget: number): void {
  if (actual > budget) {
    log.recordFailure(label, { message: `gzip ${formatKB(actual)} exceeds budget ${formatKB(budget)}` })
  }
}

const editor = measure('editor.js')
const core = measure('core.js')
const styleCss = measure('style.css')
const coreCss = measure('core.css')

// The collaboration lazy chunk(s), named by the build as
// chunks/<entry>-<name>.js — every entry emits one for its dynamic
// `import('@/utils/services/collaboration')`.
const chunksDir = join(DIST, 'chunks')
const collabChunks = existsSync(chunksDir)
  ? readdirSync(chunksDir)
      .filter((file) => file.endsWith('.js'))
      .map((file) => measure(join('chunks', file)))
  : []

const rows = [editor, core, styleCss, coreCss, ...collabChunks]
console.log('entry sizes (min / gzip):')
for (const row of rows) {
  console.log(`  ${row.file.padEnd(36)} ${formatKB(row.min).padStart(9)} / ${formatKB(row.gzip).padStart(9)}`)
}

expectBudget('dist/editor.js', editor.gzip, BUDGETS.editor)
expectBudget('dist/core.js', core.gzip, BUDGETS.core)

const entryDiff = editor.gzip - core.gzip
if (entryDiff < BUDGETS.entryDiffMin) {
  log.recordFailure('editor.js − core.js gzip diff', {
    message: `${formatKB(entryDiff)} is below the ${formatKB(BUDGETS.entryDiffMin)} split floor`,
  })
}

const editorCollabChunks = collabChunks.filter((chunk) => chunk.file.includes('editor-'))
if (editorCollabChunks.length === 0) {
  log.recordFailure('collaboration chunk', {
    message: 'no lazy collaboration chunk found for the editor entry (expected dist/chunks/editor-*.js)',
  })
}
for (const chunk of collabChunks) {
  expectBudget(chunk.file, chunk.gzip, BUDGETS.collabChunk)
}

log.exitIfFailed('verify:sizes')

console.log(
  `verify:sizes OK — editor ${formatKB(editor.gzip)} gzip, core ${formatKB(core.gzip)} gzip, ` +
    `diff ${formatKB(entryDiff)}, ${collabChunks.length} lazy chunk(s)`,
)
