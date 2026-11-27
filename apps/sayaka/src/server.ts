import type { Env } from '@sayaka/server/hono-env'

import { createHonoServer } from '@sayaka/server/hono/node'
import { setLifecycleHttpServer } from '@sayaka/server/lifecycle'
import { buildLoadContext, configurePerimeter } from '@sayaka/server/perimeter'

const app = await createHonoServer<Env>({
  configure: configurePerimeter,
  getLoadContext: buildLoadContext,
  onServe: setLifecycleHttpServer,
})

export default app
