import type { ViteDevServer } from 'vite'

import { unsafeCast } from '@kobato/utils/unsafe-cast'

const VITE_DEV_SERVER_SLOT = Symbol.for('kobato.vite-dev-server')

export function getViteDevServer(): ViteDevServer | undefined {
  return unsafeCast<ViteDevServer | undefined>(Reflect.get(globalThis, VITE_DEV_SERVER_SLOT))
}
