import type { DatabaseHandle } from '@/server/infra/db/database'

import { getLogger } from '@/server/infra/logger'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('batcher-registry')

// Registry for the process-level write batchers (access log, page views,
// audit log). Each batcher module self-registers at import time with a
// factory; the bootstrap lifecycle (`@/server/bootstrap/db-lifecycle`)
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
}

interface BatcherEntry {
  name: string
  init: (handle: DatabaseHandle) => RegisteredBatcher
  instance: RegisteredBatcher | undefined
}

const entries: BatcherEntry[] = []

/**
 * Register a batcher factory. Called at module scope by each batcher
 * module. Re-registering an existing name replaces the entry and drops
 * the previous instance — HMR-safe: a re-evaluated module re-registers
 * its factory instead of duplicating it.
 */
export function registerBatcher<T extends RegisteredBatcher>(name: string, init: (handle: DatabaseHandle) => T): void {
  const index = entries.findIndex((entry) => entry.name === name)
  const entry: BatcherEntry = { name, init, instance: undefined }
  if (index === -1) {
    entries.push(entry)
  } else {
    entries[index] = entry
  }
}

/** (Re)construct every registered batcher against the given handle. */
export function initAllBatchers(handle: DatabaseHandle): void {
  for (const entry of entries) {
    entry.instance = entry.init(handle)
  }
  log.debug('batchers initialized', { count: entries.length })
}

/**
 * Flush every batcher, isolating failures per batcher so one stuck
 * batcher never blocks the rest (or the database swap that follows).
 */
export async function flushAllBatchers(): Promise<void> {
  for (const entry of entries) {
    if (!entry.instance) {
      continue
    }
    try {
      await entry.instance.flush()
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
    entry.instance = undefined
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
