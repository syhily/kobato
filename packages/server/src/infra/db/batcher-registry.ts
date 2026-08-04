import type { DatabaseHandle } from '@kobato/server/infra/db/database'

import { getLogger } from '@kobato/server/infra/logger'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

const log = getLogger('batcher-registry')

// Registry for the process-level write batchers (access log, page views,
// audit log). Each batcher module self-registers at import time with a
// factory; the bootstrap lifecycle (`@kobato/server/bootstrap/db-lifecycle`)
// then drives every registered batcher through one vocabulary —
// `initAllBatchers` on database (re)open, `flushAllBatchers` +
// `resetAllBatchers` before the database is swapped — with no per-domain
// calls and no hand-maintained order.
//
// Flush order is registration order; the batchers write independent
// tables, so order carries no semantic invariant. Flush failures are
// isolated per batcher: one failing flush never blocks the rest.
//
// Shutdown flushing is NOT routed through this registry — each
// constructed batcher registers its own shutdown hook at priority 100
// (see `InsertBatcher` / `PageViewBatcher`), which runs before the
// database-close hook at priority 0.

/** The slice of a running batcher the registry drives. */
interface RegisteredBatcher {
  flush(): Promise<unknown>
  /** Teardown flush that ignores the pause gate — preferred before the
   *  database swap so rows buffered inside a backup consistency window
   *  are written instead of stranded by the discard in `dispose`. */
  flushForTeardown?(): Promise<unknown>
  /** Drain + hold flushes for an external consistency window (analytics backup). */
  pause?(): Promise<unknown>
  /** Release a pause — buffered payloads flush immediately. */
  resume?(): void
  /** Detach process-level registrations (shutdown hooks) before the
   *  instance is dropped — restore flow re-creates batchers, and stale
   *  hooks must not accumulate. */
  dispose?(): void
}

interface BatcherEntry {
  name: string
  init: (handle: DatabaseHandle) => RegisteredBatcher
  /** Boot-time dead-letter replay for this batcher (optional — batchers
   *  without a dead-letter file simply don't fill the slot). */
  replayDeadLetter?: () => Promise<unknown>
  instance: RegisteredBatcher | undefined
}

const entries: BatcherEntry[] = []

/**
 * Register a batcher factory. Called at module scope by each batcher
 * module. Re-registering an existing name replaces the entry and drops
 * the previous instance — HMR-safe: a re-evaluated module re-registers
 * its factory instead of duplicating it.
 */
export function registerBatcher<T extends RegisteredBatcher>(
  name: string,
  init: (handle: DatabaseHandle) => T,
  options: { replayDeadLetter?: () => Promise<unknown> } = {},
): void {
  const index = entries.findIndex((entry) => entry.name === name)
  if (index !== -1) {
    // HMR re-registration: the replaced factory's live instance must
    // dispose its shutdown hook before being orphaned.
    entries[index]!.instance?.dispose?.()
    entries[index] = { name, init, replayDeadLetter: options.replayDeadLetter, instance: undefined }
    return
  }
  entries.push({ name, init, replayDeadLetter: options.replayDeadLetter, instance: undefined })
}

/** (Re)construct every registered batcher against the given handle. */
export function initAllBatchers(handle: DatabaseHandle): void {
  for (const entry of entries) {
    // HMR path: a replaced instance must dispose its shutdown hook, or
    // every dev re-evaluation leaks one (same contract as reset).
    entry.instance?.dispose?.()
    entry.instance = entry.init(handle)
  }
  log.debug('batchers initialized', { count: entries.length })
}

/**
 * Flush every batcher, isolating failures per batcher so one stuck
 * batcher never blocks the rest (or the database swap that follows).
 * Prefers the teardown flush: the swap may land inside a backup's pause
 * window, and the paused-gated `flush()` would silently keep those rows
 * buffered for `dispose()` to discard.
 */
export async function flushAllBatchers(): Promise<void> {
  for (const entry of entries) {
    if (!entry.instance) {
      continue
    }
    try {
      if (entry.instance.flushForTeardown) {
        await entry.instance.flushForTeardown()
      } else {
        await entry.instance.flush()
      }
    } catch (error) {
      log.warn('batcher flush failed; continuing with the rest', {
        batcher: entry.name,
        err: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/** Drop every instance (after a flush, before a database swap). */
export function resetAllBatchers(): void {
  for (const entry of entries) {
    entry.instance?.dispose?.()
    entry.instance = undefined
  }
}

/**
 * Replay every registered batcher's dead-letter file — the boot-time
 * counterpart of `initAllBatchers`, so bootstrap drives replay through
 * the same registry vocabulary instead of importing per-domain replay
 * functions. Failures are isolated per batcher (each replay keeps its
 * file on error by contract).
 */
export async function replayAllDeadLetters(): Promise<void> {
  for (const entry of entries) {
    if (!entry.replayDeadLetter) {
      continue
    }
    try {
      await entry.replayDeadLetter()
    } catch (error) {
      log.warn('dead-letter replay failed; continuing with the rest', {
        batcher: entry.name,
        err: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export function getBatcher<T extends RegisteredBatcher>(name: string): T | undefined {
  const entry = entries.find((candidate) => candidate.name === name)
  return entry?.instance === undefined ? undefined : unsafeCast<T>(entry.instance)
}

export function requireBatcher<T extends RegisteredBatcher>(name: string): T {
  const batcher = getBatcher<T>(name)
  if (!batcher) {
    throw new Error(`${name} not initialized — call initAllBatchers(handle) first`)
  }
  return batcher
}
