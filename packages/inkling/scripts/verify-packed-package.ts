#!/usr/bin/env node
/* oxlint-disable no-console -- CLI script: stdout is its output channel */
// Packed-package verifier: packs @inkling/editor into a temp dir, installs the
// tarball with ONLY the react/react-dom peers, and exercises the published
// entry conditions (ESM `import` and CJS `require` for `.`, ESM for the
// `./core` subpath) from throwaway consumers.
// This is the release gate for the documented install contract: no consumer
// installation of card/collaboration feature packages may be required to load
// the package root. The headless HTML surface is gated alongside: without the
// optional jsdom peer both HTML directions reject with the named error while
// lexicalStateToPlainText works, and the with-jsdom consumers pin the
// byte-exact corpus round-trip. Invoked from `pnpm verify:package`.
import { readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createFailureLog, makeTempRoot, packTarball, scaffoldConsumer } from './lib/packed-consumer-harness.ts'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NODE = process.execPath

const log = createFailureLog(REPO_ROOT)
const { phase, recordFailure, run } = log

// Minimal DOM shim: the bundles inject their CSS at module evaluation via
// document.createElement('style') + document.head.appendChild, and CodeMirror
// sniffs document.documentElement.style at import time. This is a
// module-resolution harness, not SSR support.
const DOM_SHIM = `
const shimElement = () => ({
  style: {},
  parentNode: null,
  firstChild: null,
  setAttribute() {},
  getAttribute() {
    return null
  },
  appendChild() {},
  insertBefore() {},
})
globalThis.document = {
  documentElement: { style: {} },
  createElement: shimElement,
  head: { appendChild() {}, insertBefore() {}, firstChild: null },
}
`

const EXPORT_ASSERTIONS = `
function assertExports(mod) {
  const missing = []
  if (!mod.InklingEditor) missing.push('InklingEditor')
  if (!mod.InklingComposer) missing.push('InklingComposer')
  if (typeof mod.markdownToLexicalState !== 'function') missing.push('markdownToLexicalState')
  if (typeof mod.lexicalStateToMarkdown !== 'function') missing.push('lexicalStateToMarkdown')
  if (typeof mod.lexicalStateToHtml !== 'function') missing.push('lexicalStateToHtml')
  if (typeof mod.htmlToLexicalState !== 'function') missing.push('htmlToLexicalState')
  if (typeof mod.lexicalStateToPlainText !== 'function') missing.push('lexicalStateToPlainText')
  if (!mod.EmojiPickerPlugin) missing.push('EmojiPickerPlugin')
  if (!mod.CODE_BLOCK_TRANSFORMER) missing.push('CODE_BLOCK_TRANSFORMER')
  if (!Array.isArray(mod.DEFAULT_NODES) || mod.DEFAULT_NODES.length === 0) missing.push('DEFAULT_NODES')
  if (missing.length > 0) {
    throw new Error('missing or invalid exports: ' + missing.join(', '))
  }
  const unexpected = []
  if (mod.DesignSandbox) unexpected.push('DesignSandbox')
  if (mod.InklingCardWrapper) unexpected.push('InklingCardWrapper')
  if (unexpected.length > 0) {
    throw new Error('unexpected exports (removed from the barrel in 2.0.0): ' + unexpected.join(', '))
  }
  console.log('exports OK: ' + Object.keys(mod).length + ' exports')
}
`

// Core-subpath assertions (plan C5): the `./core` entry exposes the
// comment-level composition surface and nothing beyond it. The negative
// assertions are the point of the gate — a regression that leaks the full
// barrel into core must fail here.
const CORE_EXPORT_ASSERTIONS = `
function assertCoreExports(mod) {
  const missing = []
  if (!mod.InklingComposer) missing.push('InklingComposer')
  if (!mod.InklingSurface) missing.push('InklingSurface')
  if (!mod.InklingComposableEditor) missing.push('InklingComposableEditor')
  if (!mod.RestrictContentPlugin) missing.push('RestrictContentPlugin')
  if (!Array.isArray(mod.MINIMAL_NODES) || mod.MINIMAL_NODES.length === 0) missing.push('MINIMAL_NODES')
  if (!Array.isArray(mod.BASIC_NODES) || mod.BASIC_NODES.length === 0) missing.push('BASIC_NODES')
  if (!Array.isArray(mod.MINIMAL_TRANSFORMERS) || mod.MINIMAL_TRANSFORMERS.length === 0)
    missing.push('MINIMAL_TRANSFORMERS')
  if (!Array.isArray(mod.BASIC_TRANSFORMERS) || mod.BASIC_TRANSFORMERS.length === 0)
    missing.push('BASIC_TRANSFORMERS')
  if (typeof mod.version !== 'string') missing.push('version')
  if (missing.length > 0) {
    throw new Error('missing or invalid core exports: ' + missing.join(', '))
  }
  const unexpected = []
  if (mod.DEFAULT_NODES) unexpected.push('DEFAULT_NODES')
  if (mod.EmojiPickerPlugin) unexpected.push('EmojiPickerPlugin')
  if (mod.InklingEditor) unexpected.push('InklingEditor')
  if (mod.DesignSandbox) unexpected.push('DesignSandbox')
  if (mod.InklingCardWrapper) unexpected.push('InklingCardWrapper')
  if (mod.DefaultFeaturePlugins) unexpected.push('DefaultFeaturePlugins')
  if (mod.HtmlOutputPlugin) unexpected.push('HtmlOutputPlugin')
  if (mod.markdownToLexicalState) unexpected.push('markdownToLexicalState')
  if (mod.lexicalStateToMarkdown) unexpected.push('lexicalStateToMarkdown')
  if (unexpected.length > 0) {
    throw new Error('core entry leaks full-entry exports: ' + unexpected.join(', '))
  }
  console.log('core exports OK: ' + Object.keys(mod).length + ' exports')
}

// The lazy collaboration chunk must load standalone in Node: it ships the
// yjs/y-websocket runtime for multiplayer, imported on demand by the
// composer. Located by file path (it is not a package subpath).
async function assertCollabChunkLoads() {
  const resolved = import.meta.resolve('@inkling/editor')
  const distDir = path.dirname(fileURLToPath(resolved))
  const chunkFiles = fs
    .readdirSync(path.join(distDir, 'chunks'))
    .filter((file) => file.startsWith('editor-') && file.endsWith('.js'))
  if (chunkFiles.length === 0) {
    throw new Error('no lazy collaboration chunk for the editor entry under dist/chunks/')
  }
  let factory
  for (const file of chunkFiles) {
    const mod = await import(path.join(distDir, 'chunks', file))
    factory = factory ?? mod.createWebsocketProviderFactory
  }
  if (typeof factory !== 'function') {
    throw new Error('collaboration chunk does not export createWebsocketProviderFactory')
  }
  console.log('collaboration chunk OK: ' + chunkFiles.join(', ') + ' load in Node')
}
`

// Headless-conversion assertions for consumers WITHOUT the optional jsdom
// peer: both HTML directions must reject with the named error (keep the
// string in sync with HEADLESS_DOM_MISSING_MESSAGE in
// src/html/headless-dom.ts), while the DOM-free plain-text direction works.
const HEADLESS_ASSERTIONS_NO_JSDOM = `
const HEADLESS_DOM_MISSING_MESSAGE =
  '@inkling/editor headless HTML conversion needs a DOM: pass options.dom, run where a global ' +
  "window.document exists, or install the optional 'jsdom' peer dependency"
const HEADLESS_STATE =
  '{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"hi","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
async function assertHeadlessWithoutJsdom(mod) {
  for (const [name, call] of [
    ['lexicalStateToHtml', () => mod.lexicalStateToHtml(HEADLESS_STATE)],
    ['htmlToLexicalState', () => mod.htmlToLexicalState('<p>hi</p>')],
  ]) {
    const rejected = await call().then(
      () => null,
      (error) => error,
    )
    if (!rejected || rejected.message !== HEADLESS_DOM_MISSING_MESSAGE) {
      throw new Error(name + ' should reject with HEADLESS_DOM_MISSING_MESSAGE, got: ' + rejected)
    }
  }
  const text = mod.lexicalStateToPlainText(HEADLESS_STATE)
  if (text !== 'hi') {
    throw new Error('lexicalStateToPlainText should work without a DOM, got: ' + JSON.stringify(text))
  }
  console.log('headless without jsdom OK: named rejections, plain text works')
}
`

// Headless-conversion assertions for consumers WITH jsdom installed: the
// pinned corpus round-trips byte-exactly in both directions.
const HEADLESS_ASSERTIONS_WITH_JSDOM = `
async function assertHeadlessWithJsdom(mod) {
  const state = await mod.htmlToLexicalState('<h1>Hello</h1>')
  const nodeType =
    state && state.root && state.root.children && state.root.children[0] && state.root.children[0].type
  if (nodeType !== 'extended-heading') {
    throw new Error('expected an extended-heading import, got: ' + nodeType)
  }
  const html = await mod.lexicalStateToHtml(state)
  if (html !== '<h1 id="hello">Hello</h1>') {
    throw new Error('with-jsdom render mismatch: ' + JSON.stringify(html))
  }
  console.log('headless with jsdom OK: <h1> round trip byte-exact')
}
`

const tempRoot = makeTempRoot('inkling-pack-verify-')

try {
  const pack = packTarball(log, tempRoot)
  if (!pack) {
    throw new Error('pnpm pack failed; see errors above')
  }
  const { tarballPath, files } = pack

  phase('tarball contents')
  const mustInclude = [
    'package.json',
    'README.md',
    'LICENSE',
    'dist/editor.js',
    'dist/editor.umd.cjs',
    'dist/editor.umd.js',
    'dist/style.css',
    'dist/core.js',
    'dist/core.css',
    'dist/core.d.ts',
  ]
  const missingFiles = mustInclude.filter((path) => !files.includes(path))
  if (missingFiles.length > 0) {
    recordFailure('tarball contents', { message: `missing files: ${missingFiles.join(', ')}` })
  }
  const forbidden = files.filter(
    (path) => /(^|\/)(test|src|scripts|node_modules)\//.test(path) || path.includes('.env'),
  )
  if (forbidden.length > 0) {
    recordFailure('tarball contents', { message: `unexpected files: ${forbidden.join(', ')}` })
  }
  if (missingFiles.length === 0 && forbidden.length === 0) {
    console.log(`${files.length} files, all expected entries present`)
  }

  phase('style.css token scoping')
  // Theming contract (plan C6): the `@theme` table is reference-imported, so
  // the published sheet must not emit any `--color-*` token onto
  // `:root`/`:host` (they would collide with host-owned tokens); the runtime
  // defaults live under `.inkling-lexical` instead. Both legs are asserted.
  const styleCss = readFileSync(join(REPO_ROOT, 'dist/style.css'), 'utf-8')
  const rootBlocks = [...styleCss.matchAll(/:root[^{]*\{[^}]*\}/g)].map((match) => match[0])
  const leakedTokens = rootBlocks.flatMap((block) => [...block.matchAll(/(--color-[\w-]+)\s*:/g)].map((m) => m[1]))
  if (leakedTokens.length > 0) {
    recordFailure('style.css token scoping', {
      message: `--color-* tokens emitted on :root: ${leakedTokens.join(', ')}`,
    })
  }
  if (!styleCss.includes('.inkling-lexical{--color-accent:')) {
    recordFailure('style.css token scoping', {
      message: 'no scoped token defaults found under .inkling-lexical',
    })
  }
  if (leakedTokens.length === 0 && styleCss.includes('.inkling-lexical{--color-accent:')) {
    console.log('no --color-* emission on :root; defaults scoped under .inkling-lexical')
  }

  const consumerDeps = JSON.stringify({
    '@inkling/editor': `file:${tarballPath}`,
    react: '^19.0.0',
    'react-dom': '^19.0.0',
  })

  // One consumer phase: a throwaway project that installs the tarball (plus
  // any extraDeps), then runs its check script under Node. `module` selects
  // the ESM (check.mjs) or CJS (check.cjs) entry condition.
  function consumerPhase(
    label: string,
    options: { module: boolean; extraDeps?: Record<string, string>; check: string },
  ) {
    phase(label)
    const dir = join(tempRoot, label.replaceAll(' ', '-'))
    const checkFile = options.module ? 'check.mjs' : 'check.cjs'
    scaffoldConsumer(dir, {
      packageJson: {
        name: `verify-${label.replaceAll(' ', '-')}`,
        private: true,
        ...(options.module ? { type: 'module' } : {}),
        dependencies: { ...JSON.parse(consumerDeps), ...options.extraDeps },
      },
      files: [{ name: checkFile, content: options.check }],
    })
    if (run(`install ${label}`, 'pnpm', ['install', '--no-frozen-lockfile'], { cwd: dir })) {
      const output = run(`execute ${label}`, NODE, [checkFile], { cwd: dir })
      if (output) {
        process.stdout.write(output)
      }
    }
  }

  consumerPhase('esm consumer', {
    module: true,
    check: `${DOM_SHIM}
const resolved = import.meta.resolve('@inkling/editor')
if (!resolved.endsWith('editor.js')) {
  throw new Error('ESM entry resolved to ' + resolved + ', expected .../editor.js')
}
console.log('resolved: ' + resolved)
const inkling = await import('@inkling/editor')
${EXPORT_ASSERTIONS}
assertExports(inkling)
${HEADLESS_ASSERTIONS_NO_JSDOM}
await assertHeadlessWithoutJsdom(inkling)
`,
  })

  consumerPhase('core esm consumer', {
    module: true,
    check: `import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
${DOM_SHIM}
const resolved = import.meta.resolve('@inkling/editor/core')
if (!resolved.endsWith('core.js')) {
  throw new Error('core ESM entry resolved to ' + resolved + ', expected .../core.js')
}
console.log('resolved: ' + resolved)
const core = await import('@inkling/editor/core')
${CORE_EXPORT_ASSERTIONS}
assertCoreExports(core)
await assertCollabChunkLoads()
`,
  })

  consumerPhase('cjs consumer', {
    module: false,
    check: `${DOM_SHIM}
const resolved = require.resolve('@inkling/editor')
if (!resolved.endsWith('.cjs')) {
  throw new Error('CJS entry resolved to ' + resolved + ', expected .../editor.umd.cjs')
}
console.log('resolved: ' + resolved)
const inkling = require('@inkling/editor')
${EXPORT_ASSERTIONS}
assertExports(inkling)
${HEADLESS_ASSERTIONS_NO_JSDOM}
assertHeadlessWithoutJsdom(inkling).catch((error) => {
  console.error(error)
  process.exit(1)
})
`,
  })

  // With-jsdom phases: the optional peer installed, the pinned corpus must
  // round-trip byte-exactly through both published entry conditions.
  const withJsdomDeps = { jsdom: '29.1.1' }

  consumerPhase('esm consumer with jsdom', {
    module: true,
    extraDeps: withJsdomDeps,
    check: `${DOM_SHIM}
const inkling = await import('@inkling/editor')
${HEADLESS_ASSERTIONS_WITH_JSDOM}
await assertHeadlessWithJsdom(inkling)
`,
  })

  consumerPhase('cjs consumer with jsdom', {
    module: false,
    extraDeps: withJsdomDeps,
    check: `${DOM_SHIM}
const inkling = require('@inkling/editor')
${HEADLESS_ASSERTIONS_WITH_JSDOM}
assertHeadlessWithJsdom(inkling).catch((error) => {
  console.error(error)
  process.exit(1)
})
`,
  })
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

log.exitIfFailed('verify:package')

console.log('\nverify:package OK — packed ESM, CJS, and core entries load with only react/react-dom installed')
