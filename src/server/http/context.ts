import type { Env as HonoPinoEnv } from 'hono-pino'

import type { ViewerContext } from '@/server/domains/auth/rbac'
import type { BlogSession } from '@/server/domains/auth/session-storage'

type BaseEnv = {
  Variables: {
    requestId: string
    clientAddress: string
    session: BlogSession
    sessionDirty: boolean
    viewer: ViewerContext | null
  }
}

export type Env = BaseEnv & HonoPinoEnv
