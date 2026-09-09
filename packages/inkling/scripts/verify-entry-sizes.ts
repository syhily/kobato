#!/usr/bin/env node
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
// - editor.js: 725KB. The C5 680KB cap kept ~3% headroom over the 660.2KB
//   post-split measurement; enabling React Compiler (vite.config.ts
//   `compiler: true`, oxc-transform-react) added the per-component memo
//   cache machinery, moving the entry to 704.7KB — 725KB restores ~3%
//   headroom over that.
// - core.js: 260KB. First measurement + 5% was 245KB over 232.4KB; React
//   Compiler moved the entry to 248.1KB, so the budget re-baselines with
//   the same ~5% headroom.
// - headless.js: "first measurement + 5%" — measured 171.8KB gzip on the
//   first three-entry build (the HTML path's ~160KB plus ~12KB for the
//   markdown round-trip), so the budget is 190KB (~10% headroom).
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
  editor: 725 * KB,
  core: 260 * KB,
  headless: 190 * KB,
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
const headless = measure('headless.js')
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

const rows = [editor, core, headless, styleCss, coreCss, ...collabChunks]
console.log('entry sizes (min / gzip):')
for (const row of rows) {
  console.log(`  ${row.file.padEnd(36)} ${formatKB(row.min).padStart(9)} / ${formatKB(row.gzip).padStart(9)}`)
}

expectBudget('dist/editor.js', editor.gzip, BUDGETS.editor)
expectBudget('dist/core.js', core.gzip, BUDGETS.core)
expectBudget('dist/headless.js', headless.gzip, BUDGETS.headless)

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
    `headless ${formatKB(headless.gzip)} gzip, diff ${formatKB(entryDiff)}, ${collabChunks.length} lazy chunk(s)`,
)
