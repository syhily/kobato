import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ServerTraceRuntimeConfig } from '@/server/infra/trace/config'

import {
  __pipelineVerification,
  canonicalFunctionBody,
  sha256Text,
  verifyRumPrivacyPipeline,
} from '@/server/infra/trace/pipeline-verify'
import {
  RUM_PRIVACY_FUNCTION_NAME,
  RUM_PRIVACY_PIPELINE_DESCRIPTION,
  RUM_PRIVACY_PIPELINE_NAME,
} from '@/shared/contracts/trace-pipeline'

const CONFIG: ServerTraceRuntimeConfig = {
  endpoint: 'http://127.0.0.1:5080',
  organization: 'default',
  authorizationHeader: 'Basic dGVzdDp0ZXN0',
  sampleRate: 1,
  includeRedactedSql: false,
  otlpTracesUrl: 'http://127.0.0.1:5080/api/default/v1/traces',
  otlpMetricsUrl: 'http://127.0.0.1:5080/api/default/v1/metrics',
}

const BODY = readFileSync(join(process.cwd(), 'scripts/trace/assets/rum-privacy.vrl'), 'utf-8').trim()

function pipeline(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: RUM_PRIVACY_PIPELINE_NAME,
    enabled: true,
    description: RUM_PRIVACY_PIPELINE_DESCRIPTION,
    source: {
      source_type: 'realtime',
      org_id: 'default',
      stream_name: '_rumdata',
      stream_type: 'logs',
    },
    nodes: [
      {
        id: 'input',
        io_type: 'input',
        data: { node_type: 'stream', org_id: 'default', stream_name: '_rumdata', stream_type: 'logs' },
      },
      {
        id: 'privacy',
        io_type: 'default',
        data: { node_type: 'function', name: RUM_PRIVACY_FUNCTION_NAME, after_flatten: true },
      },
      {
        id: 'output',
        io_type: 'output',
        data: { node_type: 'stream', org_id: 'default', stream_name: '_rumdata', stream_type: 'logs' },
      },
    ],
    edges: [
      { id: 'einput-privacy', source: 'input', target: 'privacy' },
      { id: 'eprivacy-output', source: 'privacy', target: 'output' },
    ],
    ...overrides,
  }
}

function functions(body = BODY): Record<string, unknown> {
  return {
    list: [
      {
        name: RUM_PRIVACY_FUNCTION_NAME,
        function: `${body} \n .`,
        transType: 0,
      },
    ],
  }
}

function mockFetch(pipelines: unknown, functionPayload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/pipelines')) {
        return { ok: true, json: async () => pipelines }
      }
      if (url.endsWith('/functions')) {
        return { ok: true, json: async () => functionPayload }
      }
      return { ok: false, json: async () => ({}) }
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RUM privacy pipeline verifier', () => {
  it('accepts the named, enabled, versioned, wired after_flatten pipeline and exact function hash', () => {
    expect(__pipelineVerification.verifiedPipeline(pipeline(), 'default')).toBe(true)
    expect(__pipelineVerification.verifiedFunctionBody(functions())).toBe(true)
    expect(sha256Text(canonicalFunctionBody(`${BODY} \n .`))).toBe(__pipelineVerification.expectedHash)
    expect(canonicalFunctionBody(`${BODY} \n .`)).toBe(BODY)
  })

  it('rejects wrong source stream, missing edges, disabled nodes, wrong function and pre-flatten', () => {
    expect(
      __pipelineVerification.verifiedPipeline(
        pipeline({
          source: {
            source_type: 'realtime',
            org_id: 'default',
            stream_name: 'other',
            stream_type: 'logs',
          },
        }),
        'default',
      ),
    ).toBe(false)
    expect(
      __pipelineVerification.verifiedPipeline(
        pipeline({ edges: [{ id: 'e1', source: 'input', target: 'output' }] }),
        'default',
      ),
    ).toBe(false)
    expect(
      __pipelineVerification.verifiedPipeline(
        pipeline({ nodes: [{ id: 'input', io_type: 'input', is_disabled: true }] }),
        'default',
      ),
    ).toBe(false)
    expect(
      __pipelineVerification.verifiedPipeline(
        pipeline({
          nodes: [
            {
              id: 'privacy',
              io_type: 'default',
              data: { node_type: 'function', name: 'other', after_flatten: true },
            },
          ],
        }),
        'default',
      ),
    ).toBe(false)
    expect(
      __pipelineVerification.verifiedPipeline(
        pipeline({
          nodes: [
            {
              id: 'privacy',
              io_type: 'default',
              data: { node_type: 'function', name: RUM_PRIVACY_FUNCTION_NAME, after_flatten: false },
            },
          ],
        }),
        'default',
      ),
    ).toBe(false)
  })

  it('requires enabled === true and exactly three nodes with two ordered edges', () => {
    expect(__pipelineVerification.verifiedPipeline(pipeline({ enabled: false }), 'default')).toBe(false)
    expect(__pipelineVerification.verifiedPipeline(pipeline({ enabled: undefined }), 'default')).toBe(false)
    expect(__pipelineVerification.verifiedPipeline(pipeline({ enabled: 'true' }), 'default')).toBe(false)

    const extraNode = [
      ...(pipeline().nodes as unknown[]),
      {
        id: 'extra',
        io_type: 'default',
        data: { node_type: 'function', name: RUM_PRIVACY_FUNCTION_NAME, after_flatten: true },
      },
    ]
    expect(__pipelineVerification.verifiedPipeline(pipeline({ nodes: extraNode }), 'default')).toBe(false)

    const extraEdge = [...(pipeline().edges as unknown[]), { id: 'einput-output', source: 'input', target: 'output' }]
    expect(__pipelineVerification.verifiedPipeline(pipeline({ edges: extraEdge }), 'default')).toBe(false)

    // A bypass edge alone leaves one of the two required hops missing.
    expect(
      __pipelineVerification.verifiedPipeline(
        pipeline({
          edges: [
            { id: 'einput-privacy', source: 'input', target: 'privacy' },
            { id: 'einput-output', source: 'input', target: 'output' },
          ],
        }),
        'default',
      ),
    ).toBe(false)
  })

  it('rejects a wrong function body even when the pipeline description is correct', () => {
    expect(__pipelineVerification.verifiedFunctionBody(functions('# tampered'))).toBe(false)
    expect(__pipelineVerification.verifiedFunctionBody(functions(''))).toBe(false)
  })

  it('returns false on non-OK responses or fetch failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    )
    await expect(verifyRumPrivacyPipeline(CONFIG)).resolves.toBe(false)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    await expect(verifyRumPrivacyPipeline(CONFIG)).resolves.toBe(false)
  })

  it('aborts a hung request within the short timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      ),
    )
    const started = Date.now()
    await expect(verifyRumPrivacyPipeline(CONFIG, 25)).resolves.toBe(false)
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('accepts a real-shaped O2 list payload from both endpoints', async () => {
    mockFetch({ list: [pipeline()] }, functions())
    await expect(verifyRumPrivacyPipeline(CONFIG)).resolves.toBe(true)
  })

  it('rejects a pipeline with a tampered function body', async () => {
    mockFetch({ list: [pipeline()] }, functions('# tampered'))
    await expect(verifyRumPrivacyPipeline(CONFIG)).resolves.toBe(false)
  })
})
