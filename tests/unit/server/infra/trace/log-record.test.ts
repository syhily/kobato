import { describe, expect, it } from 'vitest'

import { LOG_BODY_MAX_LENGTH, LOG_LINE_MAX_BYTES, projectLogLine } from '@/server/infra/trace/log-record'

const NOW = Date.UTC(2026, 0, 2, 3, 4, 5)
const SEVERITY_BY_LEVEL: Record<string, number> = { info: 9, warn: 13, error: 17, fatal: 21 }

function line(record: Record<string, unknown>): string {
  return JSON.stringify(record)
}

function infoLine(record: Record<string, unknown> = {}): string {
  return line({ level: 'info', time: '2026-01-01T00:00:00.000Z', msg: 'message', scope: 'app', ...record })
}

function expectDrop(projection: ReturnType<typeof projectLogLine>, reason: string): void {
  expect(projection).toEqual({ kind: 'drop', reason })
}

describe('projectLogLine — HTTP records', () => {
  it.each([
    ['info', 200, 'HTTP request completed'],
    ['info', 302, 'HTTP request completed'],
    ['warn', 404, 'HTTP request rejected'],
    ['warn', 400, 'HTTP request rejected'],
    ['error', 400, 'HTTP request failed'],
    ['error', 200, 'HTTP request failed'],
    ['info', 500, 'HTTP request failed'],
    ['fatal', 503, 'HTTP request failed'],
  ])('%s with status %i projects %s', (level, status, body) => {
    const projection = projectLogLine(
      line({
        level,
        time: '2026-01-01T00:00:00.000Z',
        msg: 'ignored for HTTP records',
        req: { method: 'GET', url: '/secret?token=abc', headers: { cookie: 'session=abc' } },
        res: { status, headers: { 'set-cookie': 'secret' } },
        requestId: 'req-1',
        responseTime: 12,
      }),
      NOW,
    )

    expect(projection).toEqual({
      kind: 'ok',
      record: {
        timestampMs: Date.UTC(2026, 0, 1),
        severityNumber: SEVERITY_BY_LEVEL[level],
        severityText: level.toUpperCase(),
        body,
        attributes: {
          'log.scope': 'http',
          'http.request.method': 'GET',
          'http.response.status_code': status,
        },
      },
    })
  })

  it.each(['/health', '/ready', '/api/rum/status', '/api/rum/intake/rum/v1/default/rum'])(
    'drops a quiet line for the self-telemetry path %s',
    (url) => {
      const projection = projectLogLine(
        line({
          level: 'info',
          time: '2026-01-01T00:00:00.000Z',
          req: { method: 'GET', url },
          res: { status: 200 },
        }),
        NOW,
      )

      expectDrop(projection, 'telemetry')
    },
  )

  it('keeps a rejected or failed self-telemetry request visible', () => {
    for (const [level, status] of [
      ['warn', 404],
      ['info', 500],
      ['error', 200],
    ] as const) {
      const projection = projectLogLine(
        line({
          level,
          time: '2026-01-01T00:00:00.000Z',
          req: { method: 'GET', url: '/api/rum/status' },
          res: { status },
        }),
        NOW,
      )

      expect(projection.kind).toBe('ok')
    }
  })

  it('keeps a quiet line for an ordinary path', () => {
    const projection = projectLogLine(
      line({
        level: 'info',
        time: '2026-01-01T00:00:00.000Z',
        req: { method: 'GET', url: '/posts/hello' },
        res: { status: 200 },
      }),
      NOW,
    )

    expect(projection).toMatchObject({ kind: 'ok', record: { body: 'HTTP request completed' } })
  })

  it('never reads the original message of an HTTP record', () => {
    const projection = projectLogLine(
      infoLine({
        msg: 'alice@example.com [REDACTED] {E}secret{/E}',
        req: { method: 'POST' },
        res: { status: 201 },
      }),
      NOW,
    )

    expect(projection.kind).toBe('ok')
    expect(JSON.stringify(projection)).not.toContain('alice@example.com')
    expect(JSON.stringify(projection)).not.toContain('[REDACTED]')
    expect(JSON.stringify(projection)).not.toContain('{E}')
  })

  it('omits malformed method and status values instead of forwarding them', () => {
    const projection = projectLogLine(
      line({ level: 'info', msg: 'x', req: { method: 'get' }, res: { status: 700 } }),
      NOW,
    )

    expect(projection).toMatchObject({ kind: 'ok', record: { attributes: { 'log.scope': 'http' } } })
    if (projection.kind === 'ok') {
      expect(projection.record.attributes).not.toHaveProperty('http.request.method')
      expect(projection.record.attributes).not.toHaveProperty('http.response.status_code')
      expect(projection.record.body).toBe('HTTP request completed')
    }
  })

  it('treats a non-object req as a non-HTTP record', () => {
    const projection = projectLogLine(infoLine({ req: 'not-an-object', msg: 'plain message' }), NOW)

    expect(projection).toMatchObject({
      kind: 'ok',
      record: { body: 'plain message', attributes: { 'log.scope': 'app' } },
    })
  })
})

describe('projectLogLine — non-HTTP records', () => {
  it.each([
    ['info', 9, 'INFO'],
    ['warn', 13, 'WARN'],
    ['error', 17, 'ERROR'],
    ['fatal', 21, 'FATAL'],
  ])('maps pino level %s to severity %i / %s', (level, severityNumber, severityText) => {
    const projection = projectLogLine(infoLine({ level }), NOW)

    expect(projection).toEqual({
      kind: 'ok',
      record: {
        timestampMs: Date.UTC(2026, 0, 1),
        severityNumber,
        severityText,
        body: 'message',
        attributes: { 'log.scope': 'app' },
      },
    })
  })

  it.each(['debug', 'trace', 'silent', 'unknown', '', 'INFO'])('drops unsupported level %j', (level) => {
    expectDrop(projectLogLine(infoLine({ level }), NOW), 'severity')
  })

  it('drops a record without a string level', () => {
    expectDrop(projectLogLine(line({ time: '2026-01-01T00:00:00.000Z', msg: 'x' }), NOW), 'severity')
    expectDrop(projectLogLine(line({ level: 30, msg: 'x' }), NOW), 'severity')
  })

  it('keeps the scope attribute closed and defaults an absent scope to app', () => {
    const absent = projectLogLine(line({ level: 'info', msg: 'x' }), NOW)
    expect(absent).toMatchObject({ kind: 'ok', record: { attributes: { 'log.scope': 'app' } } })

    const valid = projectLogLine(infoLine({ scope: 'webmentions.outbox' }), NOW)
    expect(valid).toMatchObject({ kind: 'ok', record: { attributes: { 'log.scope': 'webmentions.outbox' } } })
  })

  it('drops the telemetry self-loop scope outright', () => {
    expectDrop(projectLogLine(infoLine({ scope: 'trace' }), NOW), 'shape')
  })

  it.each(['bad scope!', '9start', 'a'.repeat(65), '', 42, {}])(
    'omits an invalid scope %j without defaulting it',
    (scope) => {
      const projection = projectLogLine(infoLine({ scope }), NOW)

      expect(projection.kind).toBe('ok')
      if (projection.kind === 'ok') {
        expect(projection.record.attributes).not.toHaveProperty('log.scope')
      }
    },
  )

  it('strips control characters and bounds the body by code units', () => {
    const control = projectLogLine(infoLine({ msg: 'line\u0000one\u001b[31m\u007f' }), NOW)
    expect(control).toMatchObject({ kind: 'ok', record: { body: 'lineone[31m' } })

    const long = projectLogLine(infoLine({ msg: 'a'.repeat(250) }), NOW)
    expect(long.kind).toBe('ok')
    if (long.kind === 'ok') {
      expect(long.record.body).toHaveLength(LOG_BODY_MAX_LENGTH)
    }
  })

  it('allows an empty body to stay undefined', () => {
    const empty = projectLogLine(infoLine({ msg: '' }), NOW)
    expect(empty.kind).toBe('ok')
    if (empty.kind === 'ok') {
      expect(empty.record).not.toHaveProperty('body')
    }

    const missing = projectLogLine(infoLine({ msg: undefined }), NOW)
    expect(missing.kind).toBe('ok')
    if (missing.kind === 'ok') {
      expect(missing.record).not.toHaveProperty('body')
    }
  })
})

describe('projectLogLine — privacy boundary', () => {
  it.each(['{E}', '{/E}', '[REDACTED]'])('drops a message carrying the marker %s', (marker) => {
    expectDrop(projectLogLine(infoLine({ msg: `user ${marker} value` }), NOW), 'marker')
  })

  it('projects error.type/category without message, stack, or cause', () => {
    const projection = projectLogLine(
      infoLine({
        error: {
          name: 'TypeError',
          message: 'token=super-secret',
          stack: 'at super-secret.ts:1:1',
          cause: 'super-secret-cause',
        },
      }),
      NOW,
    )

    expect(projection).toMatchObject({
      kind: 'ok',
      record: {
        attributes: { 'log.scope': 'app', 'error.type': 'TypeError', 'error.category': 'unknown' },
      },
    })
    const serialized = JSON.stringify(projection)
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toContain('stack')
    expect(serialized).not.toContain('cause')
  })

  it('projects the err path and a stable category', () => {
    const projection = projectLogLine(infoLine({ err: { name: 'ORPCError', code: 'NOT_FOUND', status: 404 } }), NOW)

    expect(projection).toMatchObject({
      kind: 'ok',
      record: {
        attributes: {
          'log.scope': 'app',
          'error.type': 'ORPCError',
          'error.category': 'orpc_not_found',
        },
      },
    })
  })

  it('never forwards forbidden fields or arbitrary context', () => {
    const projection = projectLogLine(
      infoLine({
        msg: 'static text',
        requestId: 'request-secret',
        reqId: 'req-secret',
        responseTime: 987,
        url: 'https://example.com/secret?token=abc',
        headers: { authorization: 'Bearer secret' },
        pid: 12345,
        hostname: 'secret-host',
        context: { email: 'alice@example.com', ip: '203.0.113.9' },
        extra: { nested: { secret: 'deep-secret' } },
      }),
      NOW,
    )

    const serialized = JSON.stringify(projection)
    for (const forbidden of [
      'request-secret',
      'req-secret',
      '987',
      'example.com',
      'Bearer',
      '12345',
      'secret-host',
      'alice@example.com',
      '203.0.113.9',
      'deep-secret',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }

    expect(projection.kind).toBe('ok')
    if (projection.kind === 'ok') {
      expect(Object.keys(projection.record).sort()).toEqual([
        'attributes',
        'body',
        'severityNumber',
        'severityText',
        'timestampMs',
      ])
      expect(Object.keys(projection.record.attributes).sort()).toEqual(['log.scope'])
    }
  })

  it('keeps the closed attribute set when every field is present', () => {
    const projection = projectLogLine(
      line({
        level: 'error',
        time: '2026-01-01T00:00:00.000Z',
        msg: 'ignored',
        scope: 'http',
        req: { method: 'DELETE' },
        res: { status: 503 },
        error: { name: 'Error' },
      }),
      NOW,
    )

    expect(projection.kind).toBe('ok')
    if (projection.kind === 'ok') {
      expect(Object.keys(projection.record.attributes).sort()).toEqual([
        'error.category',
        'error.type',
        'http.request.method',
        'http.response.status_code',
        'log.scope',
      ])
    }
  })
})

describe('projectLogLine — timestamp and drop reasons', () => {
  it('uses a valid ISO time and falls back to now otherwise', () => {
    expect(projectLogLine(infoLine({ time: '2026-01-01T00:00:00.000Z' }), NOW)).toMatchObject({
      kind: 'ok',
      record: { timestampMs: Date.UTC(2026, 0, 1) },
    })
    expect(projectLogLine(infoLine({ time: '2026-01-01T00:00:00+02:00' }), NOW)).toMatchObject({
      kind: 'ok',
      record: { timestampMs: Date.UTC(2025, 11, 31, 22) },
    })
    for (const time of ['yesterday', '2026-01-01', 1767225600000, undefined]) {
      expect(projectLogLine(infoLine({ time }), NOW)).toMatchObject({ kind: 'ok', record: { timestampMs: NOW } })
    }
  })

  it('drops oversize lines by UTF-8 bytes', () => {
    const oversize = line({ level: 'info', msg: 'a'.repeat(LOG_LINE_MAX_BYTES + 1) })
    expect(Buffer.byteLength(oversize, 'utf8')).toBeGreaterThan(LOG_LINE_MAX_BYTES)
    expectDrop(projectLogLine(oversize, NOW), 'oversize')

    // Multi-byte characters count as their UTF-8 width, not one code unit.
    const multibyte = line({ level: 'info', msg: '界'.repeat(LOG_LINE_MAX_BYTES / 3) })
    expect(Buffer.byteLength(multibyte, 'utf8')).toBeGreaterThan(LOG_LINE_MAX_BYTES)
    expectDrop(projectLogLine(multibyte, NOW), 'oversize')
  })

  it('drops malformed JSON and non-object payloads', () => {
    expectDrop(projectLogLine('not json', NOW), 'malformed')
    expectDrop(projectLogLine('', NOW), 'malformed')
    expectDrop(projectLogLine('null', NOW), 'shape')
    expectDrop(projectLogLine('[]', NOW), 'shape')
    expectDrop(projectLogLine('"string"', NOW), 'shape')
  })
})
