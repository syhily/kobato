import { unsafeCast } from '@kobato/base/utils/unsafe-cast'

const DEV_HOST_MARKER = Symbol.for('kobato.server.dev-host')
const DEV_HOST_STATE_SLOT = Symbol.for('kobato.server.dev-host-state')

export interface DevHostState {
  readonly flags: Map<string, boolean>
  readonly values: Map<string, unknown>
  readonly disposers: Map<string, () => void>
}

function createDevHostState(): DevHostState {
  return { flags: new Map(), values: new Map(), disposers: new Map() }
}

export function devHostState(): DevHostState | undefined {
  if (Reflect.get(globalThis, DEV_HOST_MARKER) !== true) {
    return undefined
  }
  let state = unsafeCast<DevHostState | undefined>(Reflect.get(globalThis, DEV_HOST_STATE_SLOT))
  if (state === undefined) {
    state = createDevHostState()
    Reflect.set(globalThis, DEV_HOST_STATE_SLOT, state)
  }
  return state
}

export function readDevHostFlag(key: string): boolean {
  return devHostState()?.flags.get(key) === true
}

export function writeDevHostFlag(key: string, value: boolean): void {
  devHostState()?.flags.set(key, value)
}

export function readDevHostValue(key: string): unknown {
  return devHostState()?.values.get(key)
}

export function writeDevHostValue(key: string, value: unknown): void {
  devHostState()?.values.set(key, value)
}

export function deleteDevHostValue(key: string): void {
  devHostState()?.values.delete(key)
}

export function onDevHostDispose(key: string, dispose: () => void): void {
  const state = devHostState()
  if (state === undefined) {
    return
  }
  state.disposers.get(key)?.()
  state.disposers.set(key, dispose)
}

export function __installDevHostStateForTests(): DevHostState {
  const state = createDevHostState()
  Reflect.set(globalThis, DEV_HOST_MARKER, true)
  Reflect.set(globalThis, DEV_HOST_STATE_SLOT, state)
  return state
}

export function __resetDevHostStateForTests(): void {
  Reflect.deleteProperty(globalThis, DEV_HOST_MARKER)
  Reflect.deleteProperty(globalThis, DEV_HOST_STATE_SLOT)
}
