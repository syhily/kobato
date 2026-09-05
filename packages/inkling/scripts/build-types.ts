#!/usr/bin/env node
import type { Plugin } from 'rolldown'

/* oxlint-disable no-console -- CLI script: stdout is its output channel */
// Bundled declaration build for @inkling/editor (plan 028), dual-entry since
// plan C5: one bundle per published entry — dist/editor.d.ts for `.` and
// dist/core.d.ts for `./core`.
//
// Tool note: the bundle is produced by rolldown + rolldown-plugin-dts, which
// parses declarations with oxc and needs no TypeScript JS compiler API — that
// API is gone in TypeScript 7 (the `typescript` package now ships only the
// native compiler CLI, which this plugin uses for declaration generation).
// dts-bundle-generator, the previous tool, is abandoned (last release 2024)
// and hard-requires the JS API. React stays external (it is the only runtime
// peer); every other type package referenced by the public graph is inlined
// so consumers need no second Lexical install — the same ownership contract
// as scripts/verify-packed-package.ts.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TSCONFIG = resolve(REPO_ROOT, 'tsconfig.build.json')

// React is the only runtime peer; the react/react-dom family is the sole
// allowed external. Everything else the public graph references (Lexical,
// markdown-it, ...) is inlined into the bundle. Libraries an entry never
// references simply don't enter that entry's output.
const PEER_EXTERNAL = /^react($|\/)|^react-dom($|\/)/

interface DeclarationTarget {
  entry: string
  outFile: string
  // public symbols the bundle must contain — the canary that the entry's
  // export graph made it into the output
  expectedSymbols: string[]
}

const TARGETS: DeclarationTarget[] = [
  {
    entry: resolve(REPO_ROOT, 'src/dts-entry.ts'),
    outFile: resolve(REPO_ROOT, 'dist/editor.d.ts'),
    expectedSymbols: [
      'InklingEditor',
      'InklingComposer',
      'markdownToLexicalState',
      'lexicalStateToHtml',
      'htmlToLexicalState',
    ],
  },
  {
    entry: resolve(REPO_ROOT, 'src/dts-entry-core.ts'),
    outFile: resolve(REPO_ROOT, 'dist/core.d.ts'),
    expectedSymbols: ['InklingComposer', 'InklingSurface', 'MINIMAL_NODES', 'RestrictContentPlugin'],
  },
]

// Workaround for an upstream rolldown-plugin-dts parser gap: an `export type`
// alias whose body uses the `infer X extends C` constraint syntax (TS 4.7+) is
// not registered as an export, and every import of it fails with
// MISSING_EXPORT. lexical's LexicalNode.d.ts has the only two such aliases in
// the bundle graph (GetStaticNodeType, GetStaticNodeOwnConfig). Rewrite each
// `T extends { [K]: infer V extends C } ? A : B` to the exactly equivalent
// `T extends { [K]: infer V } ? (V extends C ? A : B) : B` before the dts
// plugin parses the file. If lexical stops using the syntax the replacements
// simply no-op; if it keeps the syntax but reformats the declarations, the
// post-check below fails loudly instead of shipping a cryptic bundler error.
const INFER_EXTENDS_REWRITES: [from: string, to: string][] = [
  [
    'readonly [STATIC_NODE_TYPE]: infer Accessor extends () => string;\n} ? ReturnType<Accessor> :',
    'readonly [STATIC_NODE_TYPE]: infer Accessor;\n' +
      '} ? (Accessor extends () => string ? ReturnType<Accessor> :' +
      ' ReturnType<T[typeof PROTOTYPE_CONFIG_METHOD]> extends StaticNodeConfig<T, infer Type> ? Type : string) :',
  ],
  [
    'readonly [STATIC_NODE_CONFIG]: infer Accessor extends () => AnyStaticNodeConfigValue;\n} ? ReturnType<Accessor> :',
    'readonly [STATIC_NODE_CONFIG]: infer Accessor;\n' +
      '} ? (Accessor extends () => AnyStaticNodeConfigValue ? ReturnType<Accessor> : never) :',
  ],
]

const inferExtendsWorkaround: Plugin = {
  name: 'inkling-dts-infer-extends-workaround',
  transform: {
    filter: { id: /lexical[/\\]dist[/\\]LexicalNode\.d\.ts$/ },
    handler(code) {
      let patched = code
      for (const [from, to] of INFER_EXTENDS_REWRITES) {
        patched = patched.replace(from, to)
      }
      if (patched.includes('infer Accessor extends')) {
        throw new Error(
          'infer-extends workaround no longer matches lexical/dist/LexicalNode.d.ts — ' +
            'update INFER_EXTENDS_REWRITES in scripts/build-types.ts (or drop it if rolldown-plugin-dts fixed the parser)',
        )
      }
      return { code: patched }
    },
  },
}

// Validation scans run on a comment-free copy: the bundle retains JSDoc from
// inlined packages, and prose like "import the types directly from
// 'trusted-types/lib'" would otherwise read as a module reference.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')
}

function collectExternals(source: string): string[] {
  const externals = new Set<string>()
  for (const match of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
    externals.add(match[1])
  }
  for (const match of source.matchAll(/import\(['"]([^'"]+)['"]\)/g)) {
    externals.add(match[1])
  }
  return [...externals].sort()
}

async function buildDeclarationBundle(target: DeclarationTarget): Promise<void> {
  const bundle = await rolldown({
    input: target.entry,
    external: PEER_EXTERNAL,
    // oxlint-disable-next-line typescript/no-deprecated -- rolldown 1.2.0 renamed this to the top-level `tsconfig` option, but that one drives transform only; the declaration inlining (e.g. trusted-types/lib) resolves through the resolver's tsconfig, which is this one
    resolve: { tsconfigFilename: TSCONFIG },
    plugins: [
      inferExtendsWorkaround,
      dts({
        tsconfig: TSCONFIG,
        emitDtsOnly: true,
      }),
    ],
  })
  const { output } = await bundle.generate({ format: 'es' })
  await bundle.close()

  const chunk = output.find((item) => item.type === 'chunk')
  if (!chunk) {
    console.error(`build-types FAILED (${target.outFile}): rolldown produced no declaration chunk`)
    process.exit(1)
  }
  const content = chunk.code

  const failures: string[] = []
  const codeOnly = stripComments(content)

  const forbidden = /(?:from|import\()\s*['"](@\/|\/Users\/|\.\.\/src|src\/|test\/|demo\/)/
  if (forbidden.test(codeOnly)) {
    failures.push('declaration contains workspace alias or absolute local path')
  }

  const externals = collectExternals(codeOnly)
  const unexpected = externals.filter((name) => !PEER_EXTERNAL.test(name))
  if (unexpected.length > 0) {
    failures.push(`declaration references non-peer externals: ${unexpected.join(', ')}`)
  }

  for (const symbol of target.expectedSymbols) {
    if (!content.includes(symbol)) {
      failures.push(`declaration is missing expected public symbol: ${symbol}`)
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`build-types FAILED (${target.outFile}): ${failure}`)
    }
    process.exit(1)
  }

  writeFileSync(target.outFile, content)
  console.log(`wrote ${target.outFile} (${(content.length / 1024).toFixed(1)} KiB); externals: ${externals.join(', ')}`)

  // Fast in-repo validation; the authoritative gate is pnpm verify:types
  // (packed consumer, skipLibCheck: false, consumer TypeScript).
  execFileSync(
    'pnpm',
    [
      'exec',
      'tsc',
      '--ignoreConfig',
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      'false',
      '--target',
      'es2022',
      '--module',
      'esnext',
      '--moduleResolution',
      'bundler',
      '--lib',
      'es2022,dom,dom.iterable',
      target.outFile,
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  )
}

for (const target of TARGETS) {
  await buildDeclarationBundle(target)
}

console.log('build-types OK')
