import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { getLogger } from '@/server/infra/logger'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('batcher-registry')

// Registry for the process-level write batchers (access log, page views,
// audit log). Each batcher module self-registers at import time with a
// factory; the bootstrap lifecycle (`@/server/bootstrap/db-lifecycle`)
// then drives every registered batcher through one vocabulary —
// `initAllBatchers` on pool (re)creation, `flushAllBatchers` +
// `resetAllBatchers` before the pool is swapped — with no per-domain
// calls and no hand-maintained order.
//
// Flush order is registration order; the batchers write independent
// tables, so order carries no semantic invariant. Flush failures are
// isolated per batcher: one failing flush never blocks the rest.
//
// Shutdown flushing is NOT routed through this registry — each
// constructed batcher registers its own shutdown hook at priority 100
// (see `CopyBatcher` / `PageViewBatcher`), which runs before the
// pool-close hook at priority 0.

/** The slice of a running batcher the registry drives. */
interface RegisteredBatcher {
  flush(): Promise<unknown>
}

interface BatcherEntry {
  name: string
  init: (pool: Pool, db: NodePgDatabase) => RegisteredBatcher
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
  init: (pool: Pool, db: NodePgDatabase) => T,
): void {
  const index = entries.findIndex((entry) => entry.name === name)
  const entry: BatcherEntry = { name, init, instance: undefined }
  if (index === -1) {
    entries.push(entry)
  } else {
    entries[index] = entry
  }
}

/** (Re)construct every registered batcher against the given connections. */
export function initAllBatchers(pool: Pool, db: NodePgDatabase): void {
  for (const entry of entries) {
    entry.instance = entry.init(pool, db)
  }
}

/**
 * Flush every initialized batcher. Failures are logged and isolated so
 * one failing batcher never blocks the rest; never rejects.
 */
export async function flushAllBatchers(): Promise<void> {
  for (const entry of entries) {
    if (!entry.instance) {
      continue
    }
    try {
      await entry.instance.flush()
    } catch (err) {
      log.warn('batcher flush failed; continuing with the rest', {
        batcher: entry.name,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/** Drop every batcher instance. Registrations are kept. */
export function resetAllBatchers(): void {
  for (const entry of entries) {
    entry.instance = undefined
  }
}

/** Look up a running batcher by name; `undefined` until initialized. */
export function getBatcher<T extends RegisteredBatcher>(name: string): T | undefined {
  for (const entry of entries) {
    if (entry.name === name) {
      // The factory registered under `name` fixes the instance type; the
      // registry stores heterogeneous batchers behind one shape.
      return unsafeCast<T | undefined>(entry.instance)
    }
  }
  return undefined
}

/** Like `getBatcher`, but throws when the batcher is not initialized. */
export function requireBatcher<T extends RegisteredBatcher>(name: string): T {
  const instance = getBatcher<T>(name)
  if (!instance) {
    throw new Error(`${name} not initialized — call initAllBatchers(pool, db) first`)
  }
  return instance
}
