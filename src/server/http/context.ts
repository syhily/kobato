import type { Env as HonoPinoEnv } from 'hono-pino'

import type { RequestContext } from '@/server/http/request-context'

type BaseEnv = {
  Variables: {
    requestId: string
    /** The canonical per-request fact base — see `@/server/http/request-context`. */
    requestContext: RequestContext
  }
}

export type Env = BaseEnv & HonoPinoEnv
