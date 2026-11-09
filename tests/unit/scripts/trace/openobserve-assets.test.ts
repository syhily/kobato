import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { O2_IMAGE, RETENTION_DAYS, stateDirectory } from '../../../../scripts/trace/lib.ts'
import { TRACE_METRIC_NAMES, TRACE_METRIC_STREAM_PREFIXES } from '../../../../src/shared/contracts/trace-metrics.ts'
import {
  RUM_PRIVACY_PIPELINE_DESCRIPTION,
  RUM_PRIVACY_VRL_SHA256,
} from '../../../../src/shared/contracts/trace-pipeline.ts'

const ASSETS = join(import.meta.dirname, '../../../../scripts/trace/assets')
const DASHBOARDS = join(ASSETS, 'dashboards')

interface Panel {
  id: string
  queries: Array<{
    query?: string
    customQuery?: boolean
    fields?: { stream?: string; stream_type?: string }
  }>
}

interface Dashboard {
  title?: string
  tabs?: Array<{ panels?: Panel[] }>
}

async function dashboards(): Promise<Array<{ file: string; body: Dashboard }>> {
  const files = (await readdir(DASHBOARDS)).filter((name) => name.endsWith('.json')).sort()
  return Promise.all(
    files.map(async (file) => ({
      file,
      body: JSON.parse(await readFile(join(DASHBOARDS, file), 'utf-8')) as Dashboard,
    })),
  )
}

describe('OpenObserve development assets (ADR-0012)', () => {
  it('pins a stable O2 image and the shortest OSS retention', () => {
    expect(O2_IMAGE).toBe('openobserve/openobserve:v1.1.2')
    expect(RETENTION_DAYS).toBe(1)
  })

  it('defaults the state directory inside the worktree tmp/ tree', () => {
    expect(stateDirectory()).toBe(join(process.cwd(), 'tmp', 'openobserve'))
  })

  it('ships exactly the four real dashboards', async () => {
    const entries = await dashboards()
    expect(entries.map((entry) => entry.file)).toEqual([
      'browser.json',
      'correlation.json',
      'overview.json',
      'server.json',
    ])
    expect(entries.map((entry) => entry.body.title)).toEqual([
      'Kobato — Browser',
      'Kobato — Correlation',
      'Kobato — Overview',
      'Kobato — Server',
    ])
  })

  it('every panel carries a runnable SQL query on a declared stream', async () => {
    const required = new Set([
      'ov-requests',
      'ov-latency',
      'ov-vitals',
      'sv-ssr',
      'sv-orpc',
      'sv-db',
      'sv-outbound',
      'sv-image-queue',
      'sv-image-exec',
      'br-views',
      'br-errors',
      'co-spans',
      'co-rum-trace',
    ])
    const ids = new Set<string>()
    for (const entry of await dashboards()) {
      const panels = (entry.body.tabs ?? []).flatMap((tab) => tab.panels ?? [])
      expect(panels.length).toBeGreaterThan(0)
      for (const panel of panels) {
        ids.add(panel.id)
        const query = panel.queries?.[0]
        expect(query?.query, `${entry.file}/${panel.id} query`).toBeTruthy()
        expect(query?.customQuery, `${entry.file}/${panel.id} customQuery`).toBe(true)
        expect(['logs', 'traces', 'metrics'], `${entry.file}/${panel.id} stream type`).toContain(
          query?.fields?.stream_type,
        )
        expect(query?.fields?.stream, `${entry.file}/${panel.id} stream`).toBeTruthy()
        // Raw SDK performance objects / error messages are forbidden; only
        // the numeric view_* fields and the pipeline-derived INP column.
        expect(query?.query).not.toContain('view_performance_')
        expect(query?.query).not.toContain('error_message')
      }
    }
    for (const id of required) {
      expect(ids.has(id), `${id} panel`).toBe(true)
    }
  })

  it('pins the exact privacy VRL content hash in the shared contract', async () => {
    const raw = await readFile(join(ASSETS, 'rum-privacy.vrl'), 'utf-8')
    const hash = createHash('sha256').update(raw.trim(), 'utf8').digest('hex')
    expect(hash).toBe(RUM_PRIVACY_VRL_SHA256)
    expect(RUM_PRIVACY_PIPELINE_DESCRIPTION).toContain(`vrl-sha256=${hash}`)
  })

  it('every declared metric name is covered by a retention stream prefix', () => {
    for (const name of Object.values(TRACE_METRIC_NAMES)) {
      const stream = name.replaceAll('.', '_')
      expect(
        TRACE_METRIC_STREAM_PREFIXES.some((prefix) => stream.startsWith(prefix)),
        `${name} (${stream}) is not covered by a retention prefix`,
      ).toBe(true)
    }
  })

  it('converts every RUM nanosecond duration in dashboard SQL to microseconds', async () => {
    const durations = [
      'view_largest_contentful_paint',
      'view_first_contentful_paint',
      'view_first_byte',
      'view_loading_time',
      'view_time_spent',
      'resource_duration',
      'long_task_duration',
      'long_task_blocking_duration',
    ]
    for (const entry of await dashboards()) {
      for (const panel of (entry.body.tabs ?? []).flatMap((tab) => tab.panels ?? [])) {
        const query = panel.queries?.[0]?.query ?? ''
        for (const field of durations) {
          if (query.includes(field)) {
            expect(
              query.includes(`${field}) / 1000.0`) || query.includes(`${field} / 1000.0`),
              `${entry.file}/${panel.id} ${field} unit`,
            ).toBe(true)
          }
        }
      }
    }
  })

  it('aggregates delta counter/histogram streams as per-bucket totals', async () => {
    // The OTLP exporter uses DELTA temporality (pinned by the runtime
    // temporality test), so each `_sum`/`_count` row is the increment for one
    // export interval. Bucketing with `sum(value)` yields that bucket's true
    // total; `avg(value)` would report a mean increment instead of a total.
    let sumPanels = 0
    let countPanels = 0
    for (const entry of await dashboards()) {
      for (const panel of (entry.body.tabs ?? []).flatMap((tab) => tab.panels ?? [])) {
        const query = panel.queries?.[0]
        const stream = query?.fields?.stream ?? ''
        const isSum = stream.endsWith('_sum')
        const isCount = stream.endsWith('_count')
        if (!isSum && !isCount) {
          continue
        }
        const sql = query?.query ?? ''
        expect(sql, `${entry.file}/${panel.id} must total delta values`).toContain('sum(value)')
        expect(sql, `${entry.file}/${panel.id} must not average delta values`).not.toContain('avg(value)')
        expect(sql, `${entry.file}/${panel.id} must not take a max of delta values`).not.toMatch(/max\(value\)/)
        if (isSum) {
          sumPanels += 1
          expect(sql, `${entry.file}/${panel.id} total alias`).toMatch(/AS total_\w+/)
        } else {
          countPanels += 1
        }
      }
    }
    expect(sumPanels).toBeGreaterThanOrEqual(2)
    expect(countPanels).toBeGreaterThanOrEqual(1)
  })

  it('privacy VRL is a fail-closed allowlist that keeps correlation/vitals', async () => {
    const vrl = await readFile(join(ASSETS, 'rum-privacy.vrl'), 'utf-8')
    expect(vrl.trimEnd().endsWith('. = safe')).toBe(true)
    expect(vrl).not.toContain('del(')
    for (const field of [
      'type',
      'date',
      'session_id',
      'view_name',
      'view_url',
      '_o2_trace_id',
      '_o2_span_id',
      'view_largest_contentful_paint',
      'view_cumulative_layout_shift',
      'view_inp_us',
      'resource_size_bucket',
      'error_type',
      'error_handling',
    ]) {
      expect(vrl, `${field} allowlisted`).toContain(`safe.${field}`)
    }
    for (const forbidden of [
      'unknown_secret_field',
      '.ip',
      '.user_agent_',
      '.device_',
      '.error_stack',
      '.error_message',
      '.view_performance_lcp',
      '.resource_response_headers',
      '.resource_size)',
    ]) {
      expect(vrl, `${forbidden} absent`).not.toContain(`safe${forbidden}`)
    }
    expect(vrl).toContain('safe.view_inp_us = null')
    expect(vrl).toContain('exists(old.view_performance_inp_duration)')
    expect(vrl).toContain('ns / 1000.0')
    expect(vrl).not.toContain('safe.view_inp_us = 0')
  })
})
