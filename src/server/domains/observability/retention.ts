// Opt-in OpenObserve stream retention. `retentionDays = 0` (the
// default) leaves the operator's own OpenObserve policy untouched; a positive
// value makes the server own the retention of every Kobato stream — RUM,
// traces, server logs, and the closed metric set. The sync runs at boot and
// after every observability settings save, applying only drifted streams, so
// a manual OpenObserve-side edit is overwritten on the next pass while the
// field stays set. Streams are created lazily by the first ingest, so one
// that does not exist yet is picked up by a later pass.
//
// The sync is deliberately NOT part of asset provisioning (provision.ts):
// provisioning installs versioned assets once per fingerprint, while this is
// a standing data policy reconciled against the current settings snapshot.
// Every failure is logged and swallowed — a data-policy sync must never
// affect the site's availability.

import type { ObservabilitySettingsSlice } from '@/server/domains/observability/config'
import type { O2StreamType } from '@/server/domains/observability/o2-client'

import { isObservabilityConnectionVerified } from '@/server/domains/observability/connection'
import { createO2Client, O2ClientError } from '@/server/domains/observability/o2-client'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { TRACE_LOG_STREAM } from '@/shared/contracts/trace-logs'
import { isTraceMetricStreamName } from '@/shared/contracts/trace-metrics'
import { RUM_STREAM_NAME } from '@/shared/contracts/trace-pipeline'

const log = getLogger('observability.retention')

const STREAM_TYPES: readonly O2StreamType[] = ['logs', 'traces', 'metrics']

/** OTLP traces land in the organization-wide default traces stream (scripts/trace's TRACE_STREAM). */
const TRACES_STREAM = 'default'

/** Streams Kobato owns: RUM, traces, server logs, and the closed metric set. */
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

// One process-local queue: overlapping saves converge on the latest snapshot,
// and a boot sync can never interleave with a save-triggered one.
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

/**
 * Reconcile OpenObserve stream retention with the saved settings snapshot.
 * Serialized; the returned promise never rejects — a failure is logged and
 * retried on the next pass.
 */
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

/** Test seam: drop the serialization queue between cases. */
export function __resetObservabilityRetentionForTests(): void {
  queue = Promise.resolve()
}
