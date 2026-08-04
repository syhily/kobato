import type { RequestContext } from '@kobato/server/http/request-context'
import type { Env as HonoPinoEnv } from 'hono-pino'

type BaseEnv = {
  Variables: {
    requestId: string
    /** The canonical per-request fact base — see `@kobato/server/http/request-context`. */
    requestContext: RequestContext
  }
}

export type Env = BaseEnv & HonoPinoEnv
