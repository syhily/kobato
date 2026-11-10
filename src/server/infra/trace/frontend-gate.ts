// Process-wide frontend RUM verification gate.
//
// Configuration parsing produces a CANDIDATE browser bootstrap plus a
// server-only relay target. The root loader may only expose the bootstrap — and
// the intake relay may only forward — after the runtime has queried OpenObserve
// and verified the allowlist pipeline. The token guard keeps cleanup
// runtime-scoped: an HMR-disposed runtime can never clear the gate installed by
// its replacement.

import type { FrontendRumRelay } from '@/server/infra/trace/config'
import type { FrontendRumBootstrap } from '@/shared/contracts/trace'

interface GateEntry {
  token: object
  bootstrap: FrontendRumBootstrap
  relay: FrontendRumRelay
}

let current: GateEntry | null = null

export function activateFrontendGate(token: object, bootstrap: FrontendRumBootstrap, relay: FrontendRumRelay): void {
  current = { token, bootstrap, relay }
}

export function deactivateFrontendGate(token: object): void {
  if (current?.token === token) {
    current = null
  }
}

/** The verified bootstrap, or null while unverified/offline/stopped. */
export function verifiedFrontendBootstrap(): FrontendRumBootstrap | null {
  return current?.bootstrap ?? null
}

/** The verified server-only relay target, or null while the gate is closed. */
export function verifiedFrontendRelay(): FrontendRumRelay | null {
  return current?.relay ?? null
}

/** Test-only reset; runtime cleanup must use the token guard instead. */
export function __resetFrontendGateForTests(): void {
  current = null
}
