export function webmentionBackoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 60_000, 12 * 3_600_000)
}

export function truncateFailureMessage(error: string): string {
  return error.length > 200 ? `${error.slice(0, 200)}…` : error
}
