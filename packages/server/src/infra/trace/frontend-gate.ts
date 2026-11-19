import type { FrontendRumRelay } from '@kobato/server/infra/trace/config.ts'
import type { FrontendRumBootstrap } from '@kobato/telemetry/rum.ts'

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

export function verifiedFrontendBootstrap(): FrontendRumBootstrap | null {
  return current?.bootstrap ?? null
}

export function verifiedFrontendRelay(): FrontendRumRelay | null {
  return current?.relay ?? null
}

export function __resetFrontendGateForTests(): void {
  current = null
}
