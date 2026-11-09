// Process-wide frontend RUM verification gate (ADR-0012).
//
// Configuration parsing produces a CANDIDATE browser bootstrap. The root
// loader and CSP may only expose it after the DEV runtime has queried
// OpenObserve and verified the allowlist pipeline. The token guard makes
// cleanup runtime-scoped: an HMR-disposed runtime can never clear the gate
// installed by its replacement.

import type { FrontendRumBootstrap } from '@/shared/contracts/trace'

interface GateEntry {
  token: object
  bootstrap: FrontendRumBootstrap
}

let current: GateEntry | null = null

export function activateFrontendGate(token: object, bootstrap: FrontendRumBootstrap): void {
  current = { token, bootstrap }
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

/** Test-only reset; runtime cleanup must use the token guard instead. */
export function __resetFrontendGateForTests(): void {
  current = null
}
