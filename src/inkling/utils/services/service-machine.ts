/**
 * The service-machine protocol — the shape every headless flow behind a React adapter
 * publishes: snapshot out (the SnapshotStore contract), intents in (`dispatch` reduces an
 * intent to snapshot updates plus one-shot effects), and a paired dispose (request track
 * and snapshot store stop together). The gif and library browsers are full machines; three
 * flows keep method-style surfaces instead (their shapes are not intents — a lifecycle
 * `start`, per-call promises, construction-time loads) but still run their promise lines
 * through `runTrackedRequest`.
 */

import type { RequestTrack } from '@/inkling/utils/services/request-track'
import type { SnapshotListener } from '@/inkling/utils/services/snapshot-store'

/**
 * The dispatch+effect protocol: React subscribes to the snapshot and
 * dispatches intents; each intent reduces to snapshot updates plus the
 * one-shot effects the adapter executes. `TContext` carries the rare
 * per-dispatch port (the gif browser's DOM geometry); `TEffect` is `never`
 * for a machine whose intents only move the snapshot.
 */
export interface ServiceMachine<TSnapshot, TIntent, TEffect = never, TContext = void> {
  getSnapshot: () => TSnapshot
  subscribe: (listener: SnapshotListener<TSnapshot>) => () => void
  /** Reduce an intent to snapshot updates plus the one-shot effects the adapter executes. */
  dispatch: (intent: TIntent, context?: TContext) => TEffect[]
  /** Stop the request track and the snapshot store together (adapter teardown / recreation). */
  dispose: () => void
}

/** A settled request as data — a rejection is captured, never thrown, so the race guard owns the only early exit. */
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
