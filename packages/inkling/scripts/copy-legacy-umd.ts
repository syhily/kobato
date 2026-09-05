#!/usr/bin/env node
/* oxlint-disable no-console -- CLI script: stdout is its output channel */
// Post-build step (invoked from `pnpm build`): retain dist/editor.umd.js as a
// legacy artifact of the canonical dist/editor.umd.cjs (identical runtime
// body, legacy sourcemap trailer).
// Vite emits a single CJS filename per build; the legacy `.umd.js` path is a
// documented browser/direct-path artifact and must keep shipping (plan 027).
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const canonical = join(distDir, 'editor.umd.cjs')
const legacy = join(distDir, 'editor.umd.js')

if (!existsSync(canonical)) {
  console.error(`copy-legacy-umd: canonical CJS artifact missing: ${canonical}`)
  console.error('Run `pnpm build` (vite build) first.')
  process.exit(1)
}

copyFileSync(canonical, legacy)

// Copy the sourcemap and point both files at the legacy names so the legacy
// artifact's sourceMappingURL resolves to an existing file. Without a
// sourcemap, strip the dangling trailer and drop any stale legacy map.
const canonicalMap = `${canonical}.map`
if (existsSync(canonicalMap)) {
  const map = JSON.parse(readFileSync(canonicalMap, 'utf8'))
  map.file = 'editor.umd.js'
  writeFileSync(`${legacy}.map`, JSON.stringify(map))

  const legacyContent = readFileSync(legacy, 'utf8')
  if (legacyContent.includes('sourceMappingURL=editor.umd.cjs.map')) {
    writeFileSync(
      legacy,
      legacyContent.replace('sourceMappingURL=editor.umd.cjs.map', 'sourceMappingURL=editor.umd.js.map'),
    )
  }
} else {
  rmSync(`${legacy}.map`, { force: true })
  const legacyContent = readFileSync(legacy, 'utf8')
  if (legacyContent.includes('sourceMappingURL=editor.umd.cjs.map')) {
    writeFileSync(legacy, legacyContent.replace(/\n\/\/# sourceMappingURL=editor\.umd\.cjs\.map\s*$/, '\n'))
  }
}

console.log('copy-legacy-umd: dist/editor.umd.js retained (legacy artifact with identical runtime body)')
