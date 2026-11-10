import { describe, expect, it } from 'vitest'

import {
  scanLogMessages,
  scanSourceForLogMessages,
  type LogMessageAllowlistEntry,
} from '#/_helpers/log-message-literals'

// The three designed indirections: an options property forwarded to a logger.
// Each is allowed at its single call site, and the property itself is held to
// a static literal by the dynamic-option-message rule.
const ALLOWLIST: readonly LogMessageAllowlistEntry[] = [
  { path: 'src/server/http/resources/admin-upload-route.ts', text: 'options.logMessage' },
  { path: 'src/server/domains/webmentions/queue-scheduler.ts', text: 'options.rowThrewMessage' },
  // `formatTraceDiagnostic` renders DIAGNOSTIC_MESSAGES (all literals) and is
  // filtered from the outbound pipeline by the `trace` scope drop.
  { path: 'src/server/infra/trace/config.ts', text: 'message' },
  // The logger implementation itself: pino's child calls take `(context, msg)`,
  // and the forwarded `msg` is the facade's typed string parameter. Scoped to
  // the exact `wrap(ctx)` context argument so any new dynamic message in this
  // file is still reported.
  { path: 'src/server/infra/logger.ts', rule: 'dynamic-message', text: 'wrap(ctx)' },
]

function scanFixture(source: string): ReturnType<typeof scanSourceForLogMessages> {
  return scanSourceForLogMessages(source, 'fixture.ts')
}

describe('server log messages are static', () => {
  it('scans src/server/, src/server.ts, and src/entry.server.tsx and finds no dynamic or marker-bearing message', () => {
    const result = scanLogMessages({
      roots: ['src/server', 'src/server.ts', 'src/entry.server.tsx'],
      allowlist: ALLOWLIST,
    })

    expect(result.violations).toEqual([])
    expect(result.scannedFiles.length).toBeGreaterThan(100)
    expect(result.scannedFiles).toContain('src/entry.server.tsx')
    expect(result.scannedFiles).toContain('src/server.ts')
    expect(result.scannedFiles.some((file) => file.startsWith('src/server/'))).toBe(true)
    // The exemption surface stays exactly these files: no other file may hide
    // a dynamic message behind the allowlist.
    expect([...new Set(result.allowlisted.map((violation) => `${violation.file}:${violation.rule}`))]).toEqual([
      'src/server/domains/webmentions/queue-scheduler.ts:dynamic-message',
      'src/server/http/resources/admin-upload-route.ts:dynamic-message',
      'src/server/infra/logger.ts:dynamic-message',
      'src/server/infra/trace/config.ts:dynamic-message',
    ])
  })
})

describe('tripwires', () => {
  it('flags an aliased getLogger call with an interpolated message', () => {
    const violations = scanFixture(`
      import { getLogger } from '@/server/infra/logger'
      const log = getLogger('alias')
      export function run(name: string) {
        log.info(\`hello \${name}\`)
      }
    `)

    expect(violations).toEqual([expect.objectContaining({ rule: 'dynamic-message', text: '`hello ${name}`', line: 5 })])
  })

  it('flags child/withScope chains and the root logger', () => {
    const violations = scanFixture(`
      import { logger, root } from '@/server/infra/logger'
      export function run(message: string) {
        logger.child({ requestId: 'x' }).warn(message)
        root.withScope('scope').error('a' + message)
      }
    `)

    expect(violations.map((violation) => violation.rule)).toEqual(['dynamic-message', 'dynamic-message'])
  })

  it('applies the raw Pino root (object, message) signature', () => {
    const violations = scanFixture(`
      import { root } from '@/server/infra/logger'
      export function run(err: unknown, message: string, port: number, context: object) {
        root.warn({ err }, message)
        root.warn({ err }, 'static ok')
        root.warn('static ok')
        root.warn({ err })
        root.info(\`port \${port}\`)
        root.info(context, 'static ok')
      }
    `)

    expect(violations).toEqual([
      expect.objectContaining({ rule: 'dynamic-message', text: 'message', line: 4 }),
      expect.objectContaining({ rule: 'dynamic-message', text: '{ err }', line: 7 }),
      expect.objectContaining({ rule: 'dynamic-message', text: '`port ${port}`', line: 8 }),
      // An unresolved identifier could be pino's merge object: fail closed,
      // never let `(dynamic, 'static')` pass as a message pair.
      expect.objectContaining({ rule: 'dynamic-message', text: 'context', line: 9 }),
    ])
  })

  it('applies the raw root signature through an import alias', () => {
    const violations = scanFixture(`
      import { root as pinoRoot } from '@/server/infra/logger'
      export function run(err: unknown, message: string) {
        pinoRoot.error({ err }, message)
      }
    `)

    expect(violations).toEqual([expect.objectContaining({ rule: 'dynamic-message', text: 'message', line: 4 })])
  })

  it('flags Logger-typed properties and parameters', () => {
    const violations = scanFixture(`
      import type { Logger } from '@/server/infra/logger'
      interface Options { log: Logger }
      export function run(options: Options, log: Logger, message: string) {
        options.log.debug(message)
        log.fatal(message)
      }
    `)

    expect(violations).toHaveLength(2)
    expect(violations.every((violation) => violation.rule === 'dynamic-message')).toBe(true)
  })

  it('flags a non-static logMessage/rowThrewMessage property value', () => {
    const violations = scanFixture(`
      export const options = {
        logMessage: makeMessage(),
        rowThrewMessage: \`row \${id} threw\`,
      }
    `)

    expect(violations).toEqual([
      expect.objectContaining({ rule: 'dynamic-option-message', text: 'makeMessage()' }),
      expect.objectContaining({ rule: 'dynamic-option-message', text: '`row ${id} threw`' }),
    ])
  })

  it('accepts static messages, including an interpolation-free template', () => {
    const violations = scanFixture(`
      import { getLogger } from '@/server/infra/logger'
      const log = getLogger('static')
      export const options = { logMessage: 'Static option', rowThrewMessage: \`Static row\` }
      export function run() {
        log.info('plain')
        log.warn(\`no interpolation\`)
        log.error('x' as const)
      }
    `)

    expect(violations).toEqual([])
  })

  it('flags privacy markers inside a static message', () => {
    const violations = scanFixture(`
      import { getLogger } from '@/server/infra/logger'
      const log = getLogger('markers')
      log.info('user {E}alice{/E}')
      log.warn('[REDACTED] header')
    `)

    expect(violations.map((violation) => violation.rule)).toEqual(['marker-message', 'marker-message'])
  })

  it('never treats console or a stream controller as a logger', () => {
    const violations = scanFixture(`
      export function run(controller: ReadableStreamDefaultController, message: string) {
        console.error(message)
        console.info('a' + message)
        globalThis.console.warn(message)
        controller.error(message)
      }
    `)

    expect(violations).toEqual([])
  })
})
