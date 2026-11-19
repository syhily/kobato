import type { ObservabilitySettingsSlice } from '@kobato/server/domains/observability/config.ts'
import type { O2StreamType } from '@kobato/server/domains/observability/o2-client.ts'

import { isObservabilityConnectionVerified } from '@kobato/server/domains/observability/connection.ts'
import { createO2Client, O2ClientError } from '@kobato/server/domains/observability/o2-client.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'
import { TRACE_LOG_STREAM } from '@kobato/telemetry/logs.ts'
import { isTraceMetricStreamName } from '@kobato/telemetry/metrics.ts'
import { RUM_STREAM_NAME } from '@kobato/telemetry/pipeline.ts'

const log = getLogger('observability.retention')

const STREAM_TYPES: readonly O2StreamType[] = ['logs', 'traces', 'metrics']

const TRACES_STREAM = 'default'

export function isKobatoOwnedStream(name: string): boolean {
  return (
    name === RUM_STREAM_NAME || name === TRACES_STREAM || name === TRACE_LOG_STREAM || isTraceMetricStreamName(name)
  )
}

async function applyRetention(site: ObservabilitySettingsSlice, retentionDays: number): Promise<number> {
  const client = createO2Client({
    endpoint: site.endpoint,
    organization: site.organization,
    username: site.username,
    password: site.password ?? '',
  })
  let applied = 0
  for (const type of STREAM_TYPES) {
    const streams = await client.listStreams(type)
    for (const stream of streams) {
      if (!isKobatoOwnedStream(stream.name) || stream.retentionDays === retentionDays) {
        continue
      }
      await client.setStreamRetention(stream.name, type, retentionDays)
      applied += 1
    }
  }
  return applied
}

let queue: Promise<unknown> = Promise.resolve()

async function sync(): Promise<void> {
  const site = getBlogSettingsBundleSync()?.observability?.observability ?? null
  if (site === null || !isObservabilityConnectionVerified(site) || site.retentionDays <= 0) {
    return
  }
  const applied = await applyRetention(site, site.retentionDays)
  if (applied > 0) {
    log.info('OpenObserve stream retention applied', { retentionDays: site.retentionDays, streams: applied })
  }
}

export function syncObservabilityRetention(): Promise<void> {
  const task = queue.then(sync).catch((error: unknown) => {
    if (error instanceof O2ClientError) {
      log.warn('OpenObserve stream retention sync failed; the configured policy is retried on the next pass', {
        kind: error.kind,
        operation: error.operation,
        status: error.status,
      })
      return
    }
    log.warn('OpenObserve stream retention sync failed; the configured policy is retried on the next pass', {
      error: error instanceof Error ? error.name : typeof error,
    })
  })
  queue = task
  return task
}

export function __resetObservabilityRetentionForTests(): void {
  queue = Promise.resolve()
}
