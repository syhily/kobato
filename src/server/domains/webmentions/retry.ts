// Retry-policy helpers shared by the webmention outbox and inbox workers.

/** min(2^attempts × 60s, 12h) — both call sites pass the ALREADY-incremented
 *  attempt count (`row.attempts + 1`), so the first failure waits 2m, then
 *  4m → 8m → 16m, capped at 12h. */
export function webmentionBackoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 60_000, 12 * 3_600_000)
}

/** Failure strings persist unbounded provider text — cap the stored copy. */
export function truncateFailureMessage(error: string): string {
  return error.length > 200 ? `${error.slice(0, 200)}…` : error
}
