import { bigint, bigserial, boolean, bytea, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { user } from '@/server/infra/db/schema/user'

export const passkeyCredential = pgTable(
  'passkey_credential',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull().unique(),
    publicKey: bytea('public_key').notNull(),
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    transports: text('transports').array().default([]),
    deviceName: text('device_name'),
    backedUp: boolean('backed_up').notNull().default(false),
  },
  (t) => [index('passkey_credential_user_id_idx').on(t.userId)],
)
