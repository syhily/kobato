/**
 * The service-machine protocol — the one home of the shape every headless
 * flow behind a React adapter publishes (CONTEXT.md "request track",
 * "snapshot store"). Two pieces:
 *
 * - the `ServiceMachine` interface: snapshot out (getSnapshot/subscribe,
 *   the SnapshotStore contract), intents in (`dispatch` reduces an intent
 *   to snapshot updates plus the one-shot effects the adapter executes
 *   against the DOM), and a paired dispose (the request track AND the
 *   snapshot store stop together). The gif browser and the library browser
 *   are full service machines.
 * - `runTrackedRequest`: the emit(loading) → await → isLatest → emit
 *   skeleton every flow used to hand-copy. The race invariant lives here
 *   exactly once — nothing runs for an already-stale generation, a
 *   rejection is captured as data (never thrown), and the outcome reaches
 *   the caller only while the generation is still latest (`undefined`
 *   otherwise). Each flow keeps its own policy as data around the call:
 *   the start emit, the outcome classification, and the end emit.
 *
 * Three flows deliberately keep method-style surfaces instead of the
 * dispatch protocol — their shapes are not intents: the search coordinator
 * (src/hooks/search-coordinator.ts) has a lifecycle `start` and two request
 * tracks; the bookmark embed flow (src/hooks/bookmark-embed-flow.ts)
 * returns per-call promises (an init rejection rethrows so the caller can
 * paste-as-link); the Pintura asset loader
 * (src/utils/services/pintura-session.ts) fires its loads at construction
 * and its CSS line is callback-driven, not a promise. All three still run
 * their promise lines through `runTrackedRequest` and the shared
 * track+store dispose pairing.
 */

import type { RequestTrack } from '@/utils/services/request-track'
import type { SnapshotListener } from '@/utils/services/snapshot-store'

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
