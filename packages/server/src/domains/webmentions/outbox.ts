import type { Database } from '@kobato/server/infra/db/database'
import type { WebmentionOutboxRow } from '@kobato/server/infra/db/types'

import { discoverEndpoint, formatFetchFailure, type DiscoveryResult } from '@kobato/server/domains/webmentions/discover'
import {
  markWebmentionOutboxRetry,
  markWebmentionOutboxSent,
  markWebmentionOutboxTerminal,
  pickDueWebmentionOutbox,
  setWebmentionOutboxEndpoint,
} from '@kobato/server/infra/db/operations/webmention-outbox'
import { getLogger } from '@kobato/server/infra/logger'
import { safeFetch } from '@kobato/server/infra/safe-fetch'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'

const log = getLogger('webmentions.outbox')

// Sequential single-worker send loop: a small batch per wake-up keeps the
// request rate at any single target host trivially low (the batch cannot
// hold two rows for the same target URL — the pair UNIQUE forbids it —
// and consecutive batches are at least OUTBOX_MIN_DELAY_MS apart, so even
// a full 50-link burst spaces its sends out instead of firing
// back-to-back).
export const OUTBOX_BATCH_SIZE = 5
export const OUTBOX_MAX_ATTEMPTS = 5

// The response body is worthless to the sender (the W3C success payload
// is a status code, sometimes a bare URL string) — cap it anyway.
const MAX_RESPONSE_BYTES = 16 * 1024

/** min(2^n × 60s, 12h): 1m → 2m → 4m → 8m → 16m across the five attempts —
 *  endpoint outages are usually minute-scale, so the schedule stays under
 *  an hour and far below the scheduler's long-delay clamp. */
export function outboxBackoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 60_000, 12 * 3_600_000)
}

/** Honest sender UA mirroring the receiver's convention, built from the
 *  configured site origin rather than hardcoded. */
function senderUa(): string {
  const website = requireBlogSettingsSection('siteIdentity').website
  return `Kobato Webmention Sender (+${website})`
}

export type SendResult =
  | { kind: 'ok' }
  /** 4xx — the endpoint refused permanently; retrying is pointless. */
  | { kind: 'rejected'; status: number }
  | { kind: 'retry'; error: string }

/** POST the form-encoded mention through the shared SSRF guard — the
 *  protocol allowlist, host blocklist and per-hop DNS checks all apply to
 *  the endpoint exactly as they did during discovery. */
export async function sendWebmention(endpoint: string, sourceUrl: string, targetUrl: string): Promise<SendResult> {
  const result = await safeFetch(endpoint, {
    method: 'POST',
    maxBytes: MAX_RESPONSE_BYTES,
    headers: {
      'User-Agent': senderUa(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '*/*',
    },
    body: new URLSearchParams({ source: sourceUrl, target: targetUrl }).toString(),
  })
  if (result.ok) {
    return { kind: 'ok' }
  }
  if (result.reason === 'http-error' && result.status !== null && result.status >= 400 && result.status < 500) {
    return { kind: 'rejected', status: result.status }
  }
  return { kind: 'retry', error: formatFetchFailure(result) }
}

export interface OutboxHooks {
  discover: (targetUrl: string) => Promise<DiscoveryResult>
  send: (endpoint: string, sourceUrl: string, targetUrl: string) => Promise<SendResult>
}

const REAL_HOOKS: OutboxHooks = {
  discover: (targetUrl) => discoverEndpoint(targetUrl, senderUa()),
  send: (endpoint, sourceUrl, targetUrl) => sendWebmention(endpoint, sourceUrl, targetUrl),
}

function failureMessage(error: string): string {
  return error.length > 200 ? `${error.slice(0, 200)}…` : error
}

/** One more attempt against the row — or the `failed` terminal state when
 *  the budget is spent. `attempts` counts PROCESSING tries (discovery and
 *  send alike): a target whose page never answers must reach a terminal
 *  state just as much as one whose endpoint keeps 500ing. */
async function scheduleRetry(db: Database, row: WebmentionOutboxRow, error: string): Promise<void> {
  const attempts = row.attempts + 1
  if (attempts >= OUTBOX_MAX_ATTEMPTS) {
    await markWebmentionOutboxTerminal(db, row.id, 'failed', failureMessage(error), attempts)
    log.warn('Webmention send exhausted attempts', { targetUrl: row.targetUrl, attempts, error })
    return
  }
  await markWebmentionOutboxRetry(db, row.id, attempts, new Date(Date.now() + outboxBackoffMs(attempts)), error)
}

/**
 * Drive one due row: discover the endpoint when missing (terminal
 * `no-endpoint` when undeclared), then POST the mention (terminal `sent`
 * on 2xx, terminal `failed` on 4xx, exponential-backoff retry otherwise).
 */
export async function processWebmentionOutboxRow(
  db: Database,
  row: WebmentionOutboxRow,
  hooks: OutboxHooks = REAL_HOOKS,
): Promise<void> {
  let endpoint = row.endpoint
  if (endpoint === null) {
    const discovery = await hooks.discover(row.targetUrl)
    if (discovery.kind === 'retry') {
      await scheduleRetry(db, row, discovery.error)
      return
    }
    if (discovery.kind === 'none') {
      await markWebmentionOutboxTerminal(db, row.id, 'no-endpoint')
      return
    }
    endpoint = discovery.endpoint
    await setWebmentionOutboxEndpoint(db, row.id, endpoint)
  }

  const result = await hooks.send(endpoint, row.sourceUrl, row.targetUrl)
  if (result.kind === 'ok') {
    await markWebmentionOutboxSent(db, row.id)
    return
  }
  if (result.kind === 'rejected') {
    await markWebmentionOutboxTerminal(db, row.id, 'failed', `http-${result.status}`)
    return
  }
  await scheduleRetry(db, row, result.error)
}

/** The scheduler's batch: a few due rows, processed strictly in sequence. */
export async function runWebmentionOutboxBatch(db: Database, hooks: OutboxHooks = REAL_HOOKS): Promise<number> {
  const rows = await pickDueWebmentionOutbox(db, new Date(), OUTBOX_BATCH_SIZE)
  for (const row of rows) {
    try {
      await processWebmentionOutboxRow(db, row, hooks)
    } catch (error: unknown) {
      // A row must never kill the batch: whatever threw (a hook, a DB
      // hiccup) counts as one retryable failure and the loop moves on.
      log.warn('Webmention outbox row processing threw', { id: row.id, error: String(error) })
      await scheduleRetry(db, row, error instanceof Error ? error.message : String(error)).catch(() => undefined)
    }
  }
  return rows.length
}
