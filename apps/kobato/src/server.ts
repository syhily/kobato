import { startKobato } from '@kobato/server/bootstrap/start-kobato'

import { clientAssetsRoot } from '@/server/client-assets-root'
import { getViteDevServer } from '@/server/dev-server-ref'

const app = await startKobato({
  assetsRoot: clientAssetsRoot(),
  listener: import.meta.env.PROD ? { mode: 'bind' } : { mode: 'host', server: getViteDevServer()?.httpServer ?? null },
})

if (import.meta.hot) {
  import.meta.hot.accept()
}

export default app
