import { pgEnum } from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', ['admin', 'author', 'visitor'])
