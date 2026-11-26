import type { SayakaRequestContext } from '@sayaka/server/request-context'
import type { Env as HonoPinoEnv } from 'hono-pino'

type BaseEnv = {
  Variables: {
    requestId: string
    sayaka: SayakaRequestContext
  }
}

export type Env = BaseEnv & HonoPinoEnv
