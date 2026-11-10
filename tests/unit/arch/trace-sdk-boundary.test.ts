/**
 * ADR-0012 source boundary: the real OpenTelemetry/OpenObserve SDKs may only
 * enter through the approved DEV-only entry modules. Everything else —
 * including the production no-op facade (`infra/trace/facade.ts`), the log
 * projection (`infra/trace/log-record.ts`), the shared resource
 * (`infra/trace/resource.ts`), and the log sink slot (`infra/logger/sink.ts`) —
 * must stay SDK-free.
 *
 * The server entries are real: the trace runtime is reached through `src/server.ts`'s
 * DEV-only dynamic import, and the log pipeline is statically constructed by
 * the trace runtime only (never a second entry). The browser RUM loader is
 * reached through `use-dev-rum`'s DEV-gated dynamic import. This scan proves no
 * other source module imports an SDK; the production bundle scan proves the
 * real packages are absent from the shipped output.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const SOURCE_DIR = join(PROJECT_ROOT, 'src')

/** The only modules allowed to import a real SDK — and only behind DEV guards. */
export const APPROVED_DEV_SDK_ENTRIES = [
  'src/server/infra/trace/runtime.ts',
  'src/server/infra/trace/logs-runtime.ts',
  'src/client/lib/openobserve-rum.ts',
] as const

const TELEMETRY_PACKAGE_PATTERN = /^@(?:opentelemetry|openobserve)\//

function walk(dir: string, callback: (filePath: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      walk(fullPath, callback)
    } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx'))) {
      callback(fullPath)
    }
  }
}

function relativePath(absolutePath: string): string {
  return relative(PROJECT_ROOT, absolutePath).replace(/\\/g, '/')
}

/**
 * Every value specifier the bundler would resolve: static imports, side-effect
 * imports, and dynamic imports. `import type` is erased and therefore ignored.
 */
function getValueSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  let match: RegExpExecArray | null
  const fromRegex =
    /import\s+(type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s+as\s+[\w$]+)?(?:[\w$]+)?\s+from\s+['"]([^'"]+)['"]/g
  while ((match = fromRegex.exec(source)) !== null) {
    if (!match[1]) {
      specifiers.push(match[2]!)
    }
  }
  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g
  while ((match = sideEffectRegex.exec(source)) !== null) {
    specifiers.push(match[1]!)
  }
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = dynamicRegex.exec(source)) !== null) {
    specifiers.push(match[1]!)
  }
  return specifiers
}

function collectTelemetryViolations(filePaths: readonly string[]): string[] {
  const violations: string[] = []
  for (const filePath of filePaths) {
    const rel = relativePath(filePath)
    if ((APPROVED_DEV_SDK_ENTRIES as readonly string[]).includes(rel)) {
      continue
    }
    for (const specifier of getValueSpecifiers(readFileSync(filePath, 'utf-8'))) {
      if (TELEMETRY_PACKAGE_PATTERN.test(specifier)) {
        violations.push(`${rel} imports development-only telemetry SDK '${specifier}'`)
      }
    }
  }
  return violations.sort()
}

function collectSourceFiles(): string[] {
  const files: string[] = []
  walk(SOURCE_DIR, (filePath) => files.push(filePath))
  return files
}

describe('trace SDK source boundary', () => {
  it('no source module outside the approved DEV entries imports an OTel/OpenObserve SDK', () => {
    expect(collectTelemetryViolations(collectSourceFiles())).toEqual([])
  })

  it('keeps the SDK-free facade, config, resource, projection, and sink modules free of telemetry imports', () => {
    const protectedModules = [
      join(PROJECT_ROOT, 'src/server/infra/trace/facade.ts'),
      join(PROJECT_ROOT, 'src/server/infra/trace/config.ts'),
      join(PROJECT_ROOT, 'src/server/infra/trace/resource.ts'),
      join(PROJECT_ROOT, 'src/server/infra/trace/log-record.ts'),
      join(PROJECT_ROOT, 'src/server/infra/logger/sink.ts'),
      join(PROJECT_ROOT, 'src/shared/contracts/trace.ts'),
    ]

    expect(collectTelemetryViolations(protectedModules)).toEqual([])
  })

  it('tripwire: flags an unapproved SDK import and ignores type-only usage', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'trace-sdk-boundary-'))
    try {
      const leak = join(fixtureRoot, 'leak.ts')
      const typesOnly = join(fixtureRoot, 'types-only.ts')
      writeFileSync(
        leak,
        [
          "import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'",
          "import '@openobserve/browser-rum-slim'",
          "export const loadRuntime = () => import('@opentelemetry/exporter-trace-otlp-http')",
        ].join('\n'),
      )
      writeFileSync(
        typesOnly,
        ["import type { Tracer } from '@opentelemetry/api'", "export type { Tracer } from '@opentelemetry/api'"].join(
          '\n',
        ),
      )

      const violations = collectTelemetryViolations([leak, typesOnly])

      expect(violations).toHaveLength(3)
      for (const specifier of [
        '@opentelemetry/sdk-trace-node',
        '@openobserve/browser-rum-slim',
        '@opentelemetry/exporter-trace-otlp-http',
      ]) {
        expect(
          violations.some((violation) => violation.includes('leak.ts') && violation.includes(`'${specifier}'`)),
          `expected a violation naming leak.ts and '${specifier}'`,
        ).toBe(true)
      }
      expect(violations.some((violation) => violation.includes('types-only.ts'))).toBe(false)
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  it('reaches the DEV runtime only through the guarded dynamic import in server.ts', () => {
    const offenders: string[] = []
    const staticFrom = /import\s+(?:type\s+)?[^'"]*?from\s+['"]([^'"]*infra\/trace\/runtime)['"]/g
    const sideEffect = /import\s+['"]([^'"]*infra\/trace\/runtime)['"]/g
    const dynamic = /import\s*\(\s*['"]([^'"]*infra\/trace\/runtime)['"]\s*\)/g

    for (const file of collectSourceFiles()) {
      const rel = relativePath(file)
      const source = readFileSync(file, 'utf-8')
      for (const pattern of [staticFrom, sideEffect]) {
        for (const match of source.matchAll(pattern)) {
          offenders.push(`${rel} statically imports ${match[1]}`)
        }
      }
      for (const match of source.matchAll(dynamic)) {
        if (rel !== 'src/server.ts') {
          offenders.push(`${rel} dynamically imports ${match[1]}`)
        }
      }
    }

    expect(offenders).toEqual([])
    const serverSource = readFileSync(join(SOURCE_DIR, 'server.ts'), 'utf-8')
    expect(serverSource).toMatch(
      /if \(import\.meta\.env\.DEV\)[\s\S]*?await import\('@\/server\/infra\/trace\/runtime'\)/,
    )
  })

  it('depends on the slim RUM package only — never the full RUM, browser-logs, or Replay recorder', () => {
    const packageJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const allDependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }

    expect(allDependencies['@openobserve/browser-rum-slim']).toBe('catalog:')
    for (const forbidden of [
      '@openobserve/browser-rum',
      '@openobserve/browser-logs',
      '@datadog/browser-rum',
      '@datadog/browser-rum-slim',
      '@datadog/browser-rum-react',
    ]) {
      expect(allDependencies).not.toHaveProperty(forbidden)
    }

    const forbiddenPackage = /^@(?:openobserve|datadog)\/browser-(?:rum|logs)(?:-react)?$/
    const offenders: string[] = []
    for (const file of collectSourceFiles()) {
      for (const specifier of getValueSpecifiers(readFileSync(file, 'utf-8'))) {
        if (forbiddenPackage.test(specifier) && specifier !== '@openobserve/browser-rum-slim') {
          offenders.push(`${relativePath(file)} imports ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('reaches the slim browser SDK only through the guarded dynamic import', () => {
    const runtimeSource = readFileSync(join(PROJECT_ROOT, 'src/client/lib/openobserve-rum.ts'), 'utf-8')
    expect(getValueSpecifiers(runtimeSource).filter((specifier) => specifier.startsWith('@openobserve/'))).toEqual([
      '@openobserve/browser-rum-slim',
    ])
    expect(runtimeSource).toMatch(/await import\('@openobserve\/browser-rum-slim'\)/)

    const hookSource = readFileSync(join(PROJECT_ROOT, 'src/client/hooks/use-dev-rum.ts'), 'utf-8')
    expect(hookSource).not.toMatch(/from ['"]@\/client\/lib\/openobserve-rum['"]/)
    const devGuard = hookSource.indexOf('if (!import.meta.env.DEV)')
    const loadCall = hookSource.indexOf('void loadRumModule()')
    const policyGuard = hookSource.indexOf('isDevRumDenied()')
    expect(devGuard).toBeGreaterThan(-1)
    expect(loadCall).toBeGreaterThan(-1)
    expect(policyGuard).toBeGreaterThan(-1)
    // DNT/GPC, the bootstrap schema gate, and the DEV guard all run before the
    // import request is issued.
    expect(policyGuard).toBeLessThan(loadCall)
    expect(devGuard).toBeLessThan(loadCall)
    expect(hookSource.indexOf('frontendRumBootstrapSchema.safeParse')).toBeLessThan(loadCall)
  })

  it('constructs the log pipeline only from the trace runtime, never directly', () => {
    const offenders: string[] = []
    const logsRuntimeSpecifier = 'infra/trace/logs-runtime'
    for (const file of collectSourceFiles()) {
      const rel = relativePath(file)
      const source = readFileSync(file, 'utf-8')
      for (const specifier of getValueSpecifiers(source)) {
        if (specifier.includes(logsRuntimeSpecifier) && rel !== 'src/server/infra/trace/runtime.ts') {
          offenders.push(`${rel} imports ${specifier}`)
        }
      }
      // Logs are a sibling pipeline built during start, not a second entry point.
      for (const match of source.matchAll(/import\s*\(\s*['"]([^'"]*infra\/trace\/logs-runtime)['"]\s*\)/g)) {
        offenders.push(`${rel} dynamically imports ${match[1]}`)
      }
    }

    expect(offenders).toEqual([])

    const runtimeSource = readFileSync(join(PROJECT_ROOT, 'src/server/infra/trace/runtime.ts'), 'utf-8')
    expect(
      getValueSpecifiers(runtimeSource).filter((specifier) => specifier.includes(logsRuntimeSpecifier)),
    ).toHaveLength(1)

    // The log pipeline must not import the stdout logger's value surface: a
    // per-record diagnostic would loop back into its own sink.
    const logsRuntimeSource = readFileSync(join(PROJECT_ROOT, 'src/server/infra/trace/logs-runtime.ts'), 'utf-8')
    expect(getValueSpecifiers(logsRuntimeSource).filter((specifier) => specifier.includes('infra/logger'))).toEqual([])
  })

  it('pins the approved DEV-only entry modules by name', () => {
    expect([...APPROVED_DEV_SDK_ENTRIES]).toEqual([
      'src/server/infra/trace/runtime.ts',
      'src/server/infra/trace/logs-runtime.ts',
      'src/client/lib/openobserve-rum.ts',
    ])
  })
})
