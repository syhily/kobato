import type { ViteDevServer } from 'vite'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'

const DEV_SERVER_SLOT = Symbol.for('kobato.vite-dev-server')

export function getViteDevServer(): ViteDevServer | undefined {
  return unsafeCast<ViteDevServer | undefined>(Reflect.get(globalThis, DEV_SERVER_SLOT))
}
