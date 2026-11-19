import type { RequestTrack } from '@kobato/inkling-internal/services/request-track'
import type { SnapshotListener } from '@kobato/inkling-internal/services/snapshot-store'
export interface ServiceMachine<TSnapshot, TIntent, TEffect = never, TContext = void> {
  getSnapshot: () => TSnapshot
  subscribe: (listener: SnapshotListener<TSnapshot>) => () => void

  dispatch: (intent: TIntent, context?: TContext) => TEffect[]

  dispose: () => void
}
export type RequestOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown }
/**
 * The shared async core of the tracked flows: nothing runs for an
 * already-stale generation (a scheduled dispatch that fires after a newer
 * request); the rejection is captured as data; the outcome reaches the
 * caller only while the generation is still latest — a superseded or
 * disposed request resolves to `undefined`, so `if (!outcome) return` is
 * the one race guard every flow needs after the await.
 */
export async function runTrackedRequest<T>(
  track: RequestTrack,
  generation: number,
  request: () => Promise<T>,
): Promise<RequestOutcome<T> | undefined> {
  if (!track.isLatest(generation)) {
    return undefined
  }
  let outcome: RequestOutcome<T>
  try {
    outcome = { ok: true, value: await request() }
  } catch (error: unknown) {
    outcome = { ok: false, error }
  }
  return track.isLatest(generation) ? outcome : undefined
}
