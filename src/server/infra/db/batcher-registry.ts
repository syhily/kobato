import type { DatabaseHandle } from '@/server/infra/db/database'

import { getLogger } from '@/server/infra/logger'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('batcher-registry')

// Registry for the process-level write batchers (access log, page views,
// audit log), each self-registering at import time. Shutdown flushing is
// NOT routed here — batchers register their own hooks (priority 100).

interface RegisteredBatcher {
  flush(): Promise<unknown>
  /** Teardown flush that ignores the pause gate — preferred before the database swap. */
  flushForTeardown?(): Promise<unknown>
  /** Drain + hold flushes for an external consistency window (analytics backup). */
  pause?(): Promise<unknown>
  /** Release a pause — buffered payloads flush immediately. */
  resume?(): void
  /** Detach process-level registrations (shutdown hooks) before the instance is dropped. */
  dispose?(): void
}

interface BatcherEntry {
  name: string
  init: (handle: DatabaseHandle) => RegisteredBatcher
  /** Boot-time replay of this batcher's dead-letter file (optional). */
  replayDeadLetter?: () => Promise<unknown>
  instance: RegisteredBatcher | undefined
}

const entries: BatcherEntry[] = []

/**
 * Register a batcher factory (called at module scope). Re-registering a
 * name replaces the entry — HMR-safe.
 */
export function registerBatcher<T extends RegisteredBatcher>(
  name: string,
  init: (handle: DatabaseHandle) => T,
  options: { replayDeadLetter?: () => Promise<unknown> } = {},
): void {
  const index = entries.findIndex((entry) => entry.name === name)
  if (index !== -1) {
    // HMR re-registration: dispose the replaced instance's shutdown hook.
    entries[index]!.instance?.dispose?.()
    entries[index] = { name, init, replayDeadLetter: options.replayDeadLetter, instance: undefined }
    return
  }
  entries.push({ name, init, replayDeadLetter: options.replayDeadLetter, instance: undefined })
}

export function initAllBatchers(handle: DatabaseHandle): void {
  for (const entry of entries) {
    // HMR path: dispose the replaced instance's hook (same contract as reset).
    entry.instance?.dispose?.()
    entry.instance = entry.init(handle)
  }
  log.debug('batchers initialized', { count: entries.length })
}

/**
 * Flush every batcher, isolating failures per batcher. Prefers the
 * teardown flush (`flushForTeardown`) when present.
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
 * Replay every registered batcher's dead-letter file. Failures are
 * isolated per batcher (each replay keeps its file on error).
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
