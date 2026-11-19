import type { RequestContext } from '@kobato/server/http/request-context.ts'
import type { Env as HonoPinoEnv } from 'hono-pino'

type BaseEnv = {
  Variables: {
    requestId: string
    requestContext: RequestContext
  }
}

export type Env = BaseEnv & HonoPinoEnv
