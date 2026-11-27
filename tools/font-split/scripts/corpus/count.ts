import {
  mergeInto,
  selectFixtures,
  type BatchMessage,
  type WireResult,
} from '@kobato/font-split/scripts/corpus/count-core'
import { pageStream, type PageBytes } from '@kobato/font-split/scripts/corpus/dump'
import { charFreqTsv, keptCodepoints, pageFixture, type Candidate } from '@kobato/font-split/scripts/corpus/emit'
import { CORPUS_ID, dumpPath, pagesDir, tableDir } from '@kobato/font-split/scripts/corpus/profile'
import { WorkerPool } from '@kobato/font-split/scripts/corpus/worker-pool'
import { existsSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join } from 'node:path'

const WORKER_URL = new URL('./count-worker.ts', import.meta.url)
const BATCH_PAGES = 400
const BATCH_BYTES = 4 << 20
const MAX_WORKERS = 16
const PROGRESS_PAGES = 200_000

export const defaultWorkers = (): number => Math.max(1, Math.min(availableParallelism() - 1, MAX_WORKERS))

const seconds = (started: number): string => `${((performance.now() - started) / 1000).toFixed(1)}s`

export async function build(workers: number = defaultWorkers()): Promise<void> {
  const started = performance.now()
  if (!existsSync(dumpPath)) {
    throw new Error(`dump not found at ${dumpPath} — run \`download\` first`)
  }
  console.log(`streaming ${dumpPath} … (${workers} workers)`)
  const pool = new WorkerPool<BatchMessage, WireResult>(WORKER_URL, workers)
  const hans = new Map<number, number>()
  const hant = new Map<number, number>()
  const candidates: Candidate[] = []
  const inFlight = new Set<Promise<void>>()
  let docs = 0
  let streamed = 0
  let batch: PageBytes[] = []
  let batchBytes = 0
  const dispatch = (pages: PageBytes[]): void => {
    const message: BatchMessage = {
      pages: pages.map((page) => ({
        id: page.id,
        ns: page.ns,
        redirect: page.redirect,
        bytes: page.bytes.buffer,
      })),
    }
    const task = pool
      .run(
        message,
        message.pages.map((page) => page.bytes),
      )
      .then((result) => {
        docs += result.docs
        candidates.push(...result.candidates)
        mergeInto(hans, result.hans)
        mergeInto(hant, result.hant)
      })
    inFlight.add(task)
    void task.then(
      () => inFlight.delete(task),
      () => inFlight.delete(task),
    )
  }
  try {
    for await (const page of pageStream(dumpPath)) {
      streamed += 1
      if (streamed % PROGRESS_PAGES === 0) {
        console.error(`  …${streamed} pages streamed`)
      }
      batch.push(page)
      batchBytes += page.bytes.length
      if (batch.length < BATCH_PAGES && batchBytes < BATCH_BYTES) {
        continue
      }
      dispatch(batch)
      batch = []
      batchBytes = 0
      while (inFlight.size > workers * 2) {
        await Promise.race(inFlight)
      }
    }
    if (batch.length > 0) {
      dispatch(batch)
    }
    await Promise.all(inFlight)
  } finally {
    await Promise.allSettled(inFlight)
    await pool.close()
  }
  console.log(`counted ${docs} documents (${streamed} pages streamed) in ${seconds(started)}`)

  const freqBasename = `freq-${CORPUS_ID}`
  const tables: Array<['hans' | 'hant', Map<number, number>]> = [
    ['hans', hans],
    ['hant', hant],
  ]
  for (const [dim, map] of tables) {
    const path = join(tableDir, `${freqBasename}-${dim}.tsv`)
    writeFileSync(path, charFreqTsv(dim, docs, map))
    console.log(`wrote ${path} (${keptCodepoints(map)} codepoints, ${docs} documents)`)
  }

  const selected = selectFixtures(candidates)
  const fixtures: Array<['hans' | 'hant', string]> = [
    ['hans', 'zh-hans-heldout-64.txt'],
    ['hant', 'zh-hant-heldout-64.txt'],
  ]
  for (const [dim, name] of fixtures) {
    const path = join(pagesDir, name)
    writeFileSync(path, pageFixture(dim, selected))
    console.log(`wrote ${path} (${selected.length} pages)`)
  }
  console.log(`build finished in ${seconds(started)}`)
}
