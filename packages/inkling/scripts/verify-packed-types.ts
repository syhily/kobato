#!/usr/bin/env node
/* oxlint-disable no-console -- CLI script: stdout is its output channel */
// Packed-type verifier: installs the packed @inkling/editor tarball into an
// isolated temp project with only documented peers and type packages, then
// type-checks clean consumers — one fixture per published entry (`.` and
// `./core`, plan C5) — under both "Bundler" and "NodeNext" module
// resolution. Feature runtimes (Lexical, CodeMirror, emoji-mart, markdown-it,
// Yjs, etc.) are deliberately NOT installed — the published declaration must
// own its own type graph.
import { rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createFailureLog, makeTempRoot, packTarball, scaffoldConsumer } from './lib/packed-consumer-harness.ts'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const log = createFailureLog(REPO_ROOT)
const { phase, recordFailure, run } = log

interface ConsumerFixture {
  // the published entry this fixture exercises (labels every consumer phase)
  name: string
  // fixture file under test/typecheck-consumer, copied into the consumer
  // project under `localName`
  source: string
  localName: string
  // the published declaration this fixture exercises — the negative check
  // deletes it to prove the fixture reads package types
  declaration: string
}

// One fixture per published entry (plan C5): the root declaration and the
// `./core` subpath declaration each get the Bundler + NodeNext pair and the
// broken-declaration negative check.
const CONSUMER_FIXTURES: ConsumerFixture[] = [
  {
    name: 'root',
    source: join(REPO_ROOT, 'test', 'typecheck-consumer', 'consumer.tsx'),
    localName: 'consumer.tsx',
    declaration: 'editor.d.ts',
  },
  {
    name: 'core',
    source: join(REPO_ROOT, 'test', 'typecheck-consumer', 'consumer-core.tsx'),
    localName: 'consumer-core.tsx',
    declaration: 'core.d.ts',
  },
]

function makeTsconfig(module: string, moduleResolution: string, include: string[]): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'es2022',
        lib: ['es2022', 'dom', 'dom.iterable'],
        strict: true,
        jsx: 'react-jsx',
        module,
        moduleResolution,
        noEmit: true,
        skipLibCheck: false,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        types: ['react', 'react-dom'],
      },
      include,
    },
    null,
    2,
  )
}

const tempRoot = makeTempRoot('inkling-pack-types-')

// Hermetic fixture deps pinned to the repo's exact versions: the gate must be
// deterministic — floating `^` ranges made the outcome resolution-dependent
// (an @types/react float once produced a phantom TS2578 mid-review). Peer
// range breadth (^19) is deliberately NOT exercised; that is a version-matrix
// job, not this gate's.
const CONSUMER_DEPENDENCIES = {
  react: '19.2.7',
  'react-dom': '19.2.7',
}
const CONSUMER_DEV_DEPENDENCIES = {
  typescript: '7.0.2',
  '@types/react': '19.2.17',
  '@types/react-dom': '19.2.3',
}

function checkConsumer(
  label: string,
  consumerDir: string,
  module: string,
  moduleResolution: string,
  fixture: ConsumerFixture,
): boolean {
  phase(label)
  scaffoldConsumer(consumerDir, {
    packageJson: {
      name: `verify-types-${label.replaceAll(' ', '-')}`,
      private: true,
      type: 'module',
      dependencies: {
        '@inkling/editor': `file:${tarballPath}`,
        ...CONSUMER_DEPENDENCIES,
      },
      devDependencies: { ...CONSUMER_DEV_DEPENDENCIES },
    },
    copies: [{ from: fixture.source, to: fixture.localName }],
    files: [{ name: 'tsconfig.json', content: makeTsconfig(module, moduleResolution, [fixture.localName]) }],
  })

  if (!run(`${label} install`, 'pnpm', ['install', '--no-frozen-lockfile'], { cwd: consumerDir })) {
    return false
  }

  const output = run(`${label} tsc`, 'pnpm', ['exec', 'tsc', '--project', 'tsconfig.json'], {
    cwd: consumerDir,
  })
  // tsc prints nothing on success — null (not the empty string) means failure
  if (output === null) {
    return false
  }
  if (output) {
    process.stdout.write(output)
  }
  return true
}

let tarballPath = ''

try {
  const pack = packTarball(log, tempRoot)
  if (!pack) {
    throw new Error('pnpm pack failed; see errors above')
  }
  tarballPath = pack.tarballPath

  const phaseResults: { fixture: ConsumerFixture; ok: boolean }[] = []
  for (const fixture of CONSUMER_FIXTURES) {
    const fixtureName = fixture.name
    const bundlerOk = checkConsumer(
      `${fixtureName} bundler consumer`,
      join(tempRoot, `consumer-${fixtureName}-bundler`),
      'ESNext',
      'Bundler',
      fixture,
    )
    const nodenextOk = checkConsumer(
      `${fixtureName} nodenext consumer`,
      join(tempRoot, `consumer-${fixtureName}-nodenext`),
      'NodeNext',
      'NodeNext',
      fixture,
    )
    phaseResults.push({ fixture, ok: bundlerOk && nodenextOk })
  }

  for (const { fixture, ok } of phaseResults) {
    if (!ok) {
      continue
    }
    const fixtureName = fixture.name
    phase(`negative check (${fixtureName})`)
    const brokenDir = join(tempRoot, `consumer-${fixtureName}-broken-decl`)
    // Copy the Bundler consumer, then delete the emitted declaration to
    // prove the fixture is actually reading the package types and not the repo.
    scaffoldConsumer(brokenDir, {
      packageJson: {
        name: `verify-types-${fixtureName}-broken-decl`,
        private: true,
        type: 'module',
        dependencies: {
          '@inkling/editor': `file:${tarballPath}`,
          ...CONSUMER_DEPENDENCIES,
        },
        devDependencies: { ...CONSUMER_DEV_DEPENDENCIES },
      },
      copies: [{ from: fixture.source, to: fixture.localName }],
      files: [{ name: 'tsconfig.json', content: makeTsconfig('ESNext', 'Bundler', [fixture.localName]) }],
    })

    if (run(`broken-decl install (${fixtureName})`, 'pnpm', ['install', '--no-frozen-lockfile'], { cwd: brokenDir })) {
      const typesPath = join(brokenDir, 'node_modules', '@inkling', 'editor', 'dist', fixture.declaration)
      rmSync(typesPath, { force: true })
      console.log(`removed ${typesPath}`)
      // tsc MUST fail here — run it off the failure log so the expected
      // failure isn't recorded as one
      const broken = log.runExpectingFailure('pnpm', ['exec', 'tsc', '--project', 'tsconfig.json'], {
        cwd: brokenDir,
      })
      if (!broken.failed) {
        recordFailure(`negative check (${fixtureName})`, {
          message: 'broken declaration file was removed but tsc still succeeded',
        })
      } else {
        console.log(`negative check OK (${fixtureName}): missing declaration causes expected failure`)
      }
    }
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

log.exitIfFailed('verify:types')

console.log(
  '\nverify:types OK — packed declaration entries compile under Bundler and NodeNext with only peers installed',
)
