import type { Database } from '@kobato/db/database.ts'
import type { WebmentionOutboxRow } from '@kobato/db/types.ts'

import {
  markWebmentionOutboxRetry,
  markWebmentionOutboxSent,
  markWebmentionOutboxTerminal,
  pickDueWebmentionOutbox,
  setWebmentionOutboxEndpoint,
} from '@kobato/db/operations/webmention-outbox.ts'
import {
  discoverEndpoint,
  formatFetchFailure,
  type DiscoveryResult,
} from '@kobato/server/domains/webmentions/discover.ts'
import { runDueRows } from '@kobato/server/domains/webmentions/queue-scheduler.ts'
import { truncateFailureMessage, webmentionBackoffMs } from '@kobato/server/domains/webmentions/retry.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { safeFetch } from '@kobato/server/infra/safe-fetch.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'

const log = getLogger('webmentions.outbox')

// Sequential send loop: small batches ≥OUTBOX_MIN_DELAY_MS apart, so even a burst spaces its sends out.
export const OUTBOX_BATCH_SIZE = 5
export const OUTBOX_MAX_ATTEMPTS = 5

// The response body is worthless (W3C success is a status code) — cap it.
const MAX_RESPONSE_BYTES = 16 * 1024

function senderUa(): string {
  const website = requireBlogSettingsSection('siteIdentity').website
  return `Kobato Webmention Sender (+${website})`
}

export type SendResult =
  | { kind: 'ok' }
  /** 4xx — the endpoint refused permanently; retrying is pointless. */
  | { kind: 'rejected'; status: number }
  | { kind: 'retry'; error: string }

export async function sendWebmention(endpoint: string, sourceUrl: string, targetUrl: string): Promise<SendResult> {
  const result = await safeFetch(endpoint, {
    method: 'POST',
    maxBytes: MAX_RESPONSE_BYTES,
    operation: 'webmentions.send',
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

/** One more attempt, or the `failed` terminal state when the budget is
 *  spent — attempts count discovery and send alike. */
async function scheduleRetry(db: Database, row: WebmentionOutboxRow, error: string): Promise<void> {
  const attempts = row.attempts + 1
  if (attempts >= OUTBOX_MAX_ATTEMPTS) {
    await markWebmentionOutboxTerminal(db, row.id, 'failed', truncateFailureMessage(error), attempts)
    log.warn('Webmention send exhausted attempts', { targetUrl: row.targetUrl, attempts, error })
    return
  }
  await markWebmentionOutboxRetry(db, row.id, attempts, new Date(Date.now() + webmentionBackoffMs(attempts)), error)
}

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

export async function runWebmentionOutboxBatch(db: Database, hooks: OutboxHooks = REAL_HOOKS): Promise<number> {
  return runDueRows({
    pick: () => pickDueWebmentionOutbox(db, new Date(), OUTBOX_BATCH_SIZE),
    handleRow: (row) => processWebmentionOutboxRow(db, row, hooks),
    log,
    rowThrewMessage: 'Webmention outbox row processing threw',
    // A thrown row still counts as one retryable attempt; the recovery write
    // itself must never take the batch down.
    onRowError: (row, error) =>
      scheduleRetry(db, row, error instanceof Error ? error.message : String(error)).catch(() => undefined),
  })
}
