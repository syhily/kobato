import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Env as HonoPinoEnv } from 'hono-pino'
import type { Pool } from 'pg'

import type { ViewerContext } from '@/server/domains/auth/rbac'
import type { BlogSession } from '@/server/domains/auth/session-storage'

type BaseEnv = {
  Variables: {
    requestId: string
    clientAddress: string
    session: BlogSession
    sessionDirty: boolean
    viewer: ViewerContext | null
    db: NodePgDatabase
    pool: Pool
  }
}

export type Env = BaseEnv & HonoPinoEnv
