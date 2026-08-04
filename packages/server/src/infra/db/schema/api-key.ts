import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Headless front-end credentials (phase 0.6): named Ed25519 public keys
// registered by the admin, used to verify the front-end JWTs that gate
// write interactions. Core stores ONLY public keys — the private key
// stays in the front-end program's hands (a leaked DB yields no usable
// secret). Key rotation = register a new key, switch the frontend, then
// revoke the old one.
export const apiKey = sqliteTable(
  'api_key',
  {
    /** Key id — the JWT `iss` claim. */
    id: text('id').primaryKey(),
    /** Admin-facing label for the key row. */
    name: text('name').notNull(),
    /** Ed25519 public key, SPKI PEM (node:crypto `createPublicKey` parseable). */
    publicKey: text('public_key').notNull(),
    /** Granted scopes; this round only `content:write`. */
    scopes: text('scopes', { mode: 'json' }).$type<string[]>().notNull(),
    /** Last successful verification instant (audit surface). */
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    /** Set on revocation; a revoked key no longer verifies. */
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('idx_api_key_created_at').on(table.createdAt)],
)
