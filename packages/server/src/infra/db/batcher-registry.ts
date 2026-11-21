import type { DatabaseHandle } from '@kobato/db/database'

import { getLogger } from '@kobato/server/infra/logger'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

const log = getLogger('batcher-registry')

interface RegisteredBatcher {
  flush(): Promise<unknown>
  flushForTeardown?(): Promise<unknown>
  settle?(): Promise<unknown>
  pause?(): Promise<unknown>
  resume?(): void
  dispose?(): void
}

interface BatcherEntry {
  name: string
  init: (handle: DatabaseHandle) => RegisteredBatcher
  replayDeadLetter?: () => Promise<unknown>
  instance: RegisteredBatcher | undefined
}

const entries: BatcherEntry[] = []

export function registerBatcher(
  name: string,
  init: (handle: DatabaseHandle) => RegisteredBatcher,
  options: { replayDeadLetter?: () => Promise<unknown> } = {},
): void {
  const index = entries.findIndex((entry) => entry.name === name)
  if (index !== -1) {
    entries[index]!.instance?.dispose?.()
    entries[index] = { name, init, replayDeadLetter: options.replayDeadLetter, instance: undefined }
    return
  }
  entries.push({ name, init, replayDeadLetter: options.replayDeadLetter, instance: undefined })
}

export function initAllBatchers(handle: DatabaseHandle): void {
  for (const entry of entries) {
    entry.instance?.dispose?.()
    entry.instance = entry.init(handle)
  }
  log.debug('batchers initialized', { count: entries.length })
}

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

function settleInflightFlushes(): Promise<void> {
  const inflight: Promise<unknown>[] = []
  for (const entry of entries) {
    const settle = entry.instance?.settle?.()
    if (settle) {
      inflight.push(Promise.resolve(settle).catch(() => undefined))
    }
  }
  return Promise.all(inflight).then(() => undefined)
}

export function settleAllBatchers(): Promise<void> {
  return settleInflightFlushes()
}

export function resetAllBatchers(): Promise<void> {
  const inflight = settleInflightFlushes()
  for (const entry of entries) {
    entry.instance?.dispose?.()
    entry.instance = undefined
  }
  return inflight
}

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

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function getBatcher<T extends RegisteredBatcher>(name: string): T | undefined {
  const entry = entries.find((candidate) => candidate.name === name)
  return entry?.instance === undefined ? undefined : unsafeCast<T>(entry.instance)
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function requireBatcher<T extends RegisteredBatcher>(name: string): T {
  const batcher = getBatcher<T>(name)
  if (!batcher) {
    throw new Error(`${name} not initialized — call initAllBatchers(handle) first`)
  }
  return batcher
}
