import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const SOURCE_DIRS = [
  'apps/kobato/src',
  'packages/inkling/src',
  'packages/db/src',
  'packages/server/src',
  'packages/api/src/contracts',
  'packages/shared/auth/src',
  'packages/shared/catalog/src',
  'packages/shared/distribution/src',
  'packages/shared/seo/src',
  'packages/shared/utils/src',
  'packages/shared/i18n/src',
  'packages/shared/cache/src',
  'packages/shared/settings/src',
  'packages/shared/assets/src',
  'packages/shared/sanitize/src',
  'packages/ui/src',
  'packages/web/admin/src',
  'packages/web/client/src',
  'packages/web/public/src',
].map((dir) => join(PROJECT_ROOT, dir))

export const APPROVED_SDK_ENTRIES = [
  'packages/server/src/infra/trace/runtime.ts',
  'packages/server/src/infra/trace/logs-runtime.ts',
  'packages/web/client/src/lib/rum/openobserve-rum.ts',
] as const

const TELEMETRY_PACKAGE_PATTERN = /^@(?:opentelemetry|openobserve)\//

function walk(dir: string, callback: (filePath: string) => void): void {
  if (!existsSync(dir)) {
    return
  }
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
    if ((APPROVED_SDK_ENTRIES as readonly string[]).includes(rel)) {
      continue
    }
    for (const specifier of getValueSpecifiers(readFileSync(filePath, 'utf-8'))) {
      if (TELEMETRY_PACKAGE_PATTERN.test(specifier)) {
        violations.push(`${rel} imports telemetry SDK '${specifier}' outside the approved entries`)
      }
    }
  }
  return violations.sort()
}

function collectSourceFiles(): string[] {
  const files: string[] = []
  for (const dir of SOURCE_DIRS) {
    walk(dir, (filePath) => files.push(filePath))
  }
  return files
}

describe('trace SDK source boundary', () => {
  it('no source module outside the approved entries imports an OTel/OpenObserve SDK', () => {
    expect(collectTelemetryViolations(collectSourceFiles())).toEqual([])
  })

  it('keeps the SDK-free facade, config, resource, projection, and sink modules free of telemetry imports', () => {
    const protectedModules = [
      join(PROJECT_ROOT, 'packages/server/src/infra/trace/facade.ts'),
      join(PROJECT_ROOT, 'packages/server/src/infra/trace/config.ts'),
      join(PROJECT_ROOT, 'packages/server/src/infra/trace/resource.ts'),
      join(PROJECT_ROOT, 'packages/server/src/infra/trace/log-record.ts'),
      join(PROJECT_ROOT, 'packages/server/src/infra/logger/sink.ts'),
      join(PROJECT_ROOT, 'packages/shared/settings/src/telemetry/rum.ts'),
      join(PROJECT_ROOT, 'packages/shared/settings/src/telemetry/logs.ts'),
      join(PROJECT_ROOT, 'packages/shared/settings/src/telemetry/metrics.ts'),
      join(PROJECT_ROOT, 'packages/shared/settings/src/telemetry/pipeline.ts'),
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

  it('reaches the trace runtime only through the observability domain dynamic import', () => {
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
        if (rel !== 'packages/server/src/domains/observability/runtime-manager.ts') {
          offenders.push(`${rel} dynamically imports ${match[1]}`)
        }
      }
    }

    expect(offenders).toEqual([])
    const managerSource = readFileSync(
      join(PROJECT_ROOT, 'packages/server/src/domains/observability/runtime-manager.ts'),
      'utf-8',
    )
    expect(managerSource).toContain("await import('@kobato/server/infra/trace/runtime')")
    const serverSource = readFileSync(join(PROJECT_ROOT, 'apps/kobato/src/server.ts'), 'utf-8')
    expect(serverSource).not.toContain('infra/trace/runtime')
  })

  it('depends on the slim RUM package only — never the full RUM, browser-logs, or Replay recorder', () => {
    const packageJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'packages/web/client/package.json'), 'utf-8')) as {
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
    const runtimeSource = readFileSync(
      join(PROJECT_ROOT, 'packages/web/client/src/lib/rum/openobserve-rum.ts'),
      'utf-8',
    )
    expect(getValueSpecifiers(runtimeSource).filter((specifier) => specifier.startsWith('@openobserve/'))).toEqual([
      '@openobserve/browser-rum-slim',
    ])
    expect(runtimeSource).toMatch(/await import\('@openobserve\/browser-rum-slim'\)/)

    const hookSource = readFileSync(join(PROJECT_ROOT, 'packages/web/client/src/hooks/use-rum.ts'), 'utf-8')

    expect(hookSource).not.toMatch(/from ['"][^'"]*openobserve-rum(\.ts)?['"]/)
    const loadCall = hookSource.indexOf('void loadRumModule()')
    const policyGuard = hookSource.indexOf('isRumDenied()')
    const schemaGuard = hookSource.indexOf('frontendRumBootstrapSchema.safeParse')
    const ssrGuard = hookSource.indexOf('if (import.meta.env.SSR)')
    expect(ssrGuard).toBeGreaterThan(-1)
    expect(loadCall).toBeGreaterThan(-1)
    expect(policyGuard).toBeGreaterThan(-1)
    expect(schemaGuard).toBeGreaterThan(-1)
    expect(policyGuard).toBeLessThan(loadCall)
    expect(ssrGuard).toBeLessThan(loadCall)
    expect(schemaGuard).toBeLessThan(loadCall)

    expect(hookSource).not.toContain('import.meta.env.DEV')
  })
  it('constructs the log pipeline only from the trace runtime, never directly', () => {
    const offenders: string[] = []

    const logsRuntimeSpecifier = /(?:^|\/)logs-runtime(?:\.ts)?$/
    for (const file of collectSourceFiles()) {
      const rel = relativePath(file)
      const source = readFileSync(file, 'utf-8')
      for (const specifier of getValueSpecifiers(source)) {
        if (logsRuntimeSpecifier.test(specifier) && rel !== 'packages/server/src/infra/trace/runtime.ts') {
          offenders.push(`${rel} imports ${specifier}`)
        }
      }

      for (const match of source.matchAll(/import\s*\(\s*['"]([^'"]*(?:^|\/)logs-runtime(?:\.ts)?)['"]\s*\)/g)) {
        offenders.push(`${rel} dynamically imports ${match[1]}`)
      }
    }

    expect(offenders).toEqual([])

    const runtimeSource = readFileSync(join(PROJECT_ROOT, 'packages/server/src/infra/trace/runtime.ts'), 'utf-8')
    expect(
      getValueSpecifiers(runtimeSource).filter((specifier) => /(?:^|\/)logs-runtime(?:\.ts)?$/.test(specifier)),
    ).toHaveLength(1)

    const logsRuntimeSource = readFileSync(
      join(PROJECT_ROOT, 'packages/server/src/infra/trace/logs-runtime.ts'),
      'utf-8',
    )
    expect(getValueSpecifiers(logsRuntimeSource).filter((specifier) => specifier.includes('infra/logger'))).toEqual([])
  })

  it('pins the approved SDK entry modules by name', () => {
    expect([...APPROVED_SDK_ENTRIES]).toEqual([
      'packages/server/src/infra/trace/runtime.ts',
      'packages/server/src/infra/trace/logs-runtime.ts',
      'packages/web/client/src/lib/rum/openobserve-rum.ts',
    ])
  })
})
