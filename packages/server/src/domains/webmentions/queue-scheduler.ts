import type { Database } from '@kobato/db/database'
import type { Logger } from '@kobato/server/infra/logger'

import { jobDb, registerJob } from '@kobato/server/infra/job-registry'
import { getLogger } from '@kobato/server/infra/logger'

export interface QueueSchedulerOptions {
  name: string
  task: { key: string }
  findNextDueAt: (db: Database) => Date | 'now' | null
  runBatch: (db: Database) => Promise<number>
}

export interface QueueScheduler {
  readonly minDelayMs: number
}

export function makeQueueScheduler(options: QueueSchedulerOptions): QueueScheduler {
  const log = getLogger(`${options.name}-scheduler`)
  const label = `Webmention ${options.name.slice('webmentions.'.length)}`

  function nextDelayMs(): number | null {
    const due = options.findNextDueAt(jobDb())
    if (due === null) {
      return null
    }
    if (due === 'now') {
      return queue.minDelayMs
    }
    return Math.max(due.getTime() - Date.now(), queue.minDelayMs)
  }

  async function run(): Promise<void> {
    const processed = await options.runBatch(jobDb())
    if (processed > 0) {
      log.info('Webmention batch processed', { label, processed })
    }
  }

  registerJob({
    name: options.name,
    task: options.task,
    nextDelayMs,
    run,
  })

  const queue: QueueScheduler = {
    minDelayMs: 1_000,
  }
  return queue
}

export interface RunDueRowsOptions<Row> {
  pick: () => Promise<Row[]>
  handleRow: (row: Row) => Promise<void>
  log: Logger
  rowThrewMessage: string
  onRowError?: (row: Row, error: unknown) => Promise<void>
}

export async function runDueRows<Row extends { id: number | string }>(
  options: RunDueRowsOptions<Row>,
): Promise<number> {
  const rows = await options.pick()
  for (const row of rows) {
    try {
      await options.handleRow(row)
    } catch (error: unknown) {
      options.log.warn(options.rowThrewMessage, { id: row.id, error: String(error) })
      await options.onRowError?.(row, error)
    }
  }
  return rows.length
}
