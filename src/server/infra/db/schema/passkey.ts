import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { user } from '@/server/infra/db/schema/user'

export const passkeyCredential = sqliteTable(
  'passkey_credential',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    userId: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull().unique(),
    publicKey: blob('public_key', { mode: 'buffer' }).notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports', { mode: 'json' })
      .$type<string[]>()
      .$defaultFn(() => []),
    deviceName: text('device_name'),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('passkey_credential_user_id_idx').on(t.userId)],
)
