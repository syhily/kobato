import type { Database } from '@kobato/db/sqlite/database'
import type { NewNewsletterSubscriber, NewsletterSubscriberRow } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { newsletterSubscriber } from '@kobato/db/sqlite/schema/newsletter'
import { eq } from 'drizzle-orm'

export async function findSubscriberByEmail(db: Database, email: string): Promise<NewsletterSubscriberRow | null> {
  const rows = await sqliteOf(db)
    .select()
    .from(newsletterSubscriber)
    .where(eq(newsletterSubscriber.email, email))
    .limit(1)
  return rows[0] ?? null
}

export async function findSubscriberById(db: Database, id: number): Promise<NewsletterSubscriberRow | null> {
  const rows = await sqliteOf(db).select().from(newsletterSubscriber).where(eq(newsletterSubscriber.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findSubscriberByConfirmTokenHash(
  db: Database,
  tokenHash: string,
): Promise<NewsletterSubscriberRow | null> {
  const rows = await sqliteOf(db)
    .select()
    .from(newsletterSubscriber)
    .where(eq(newsletterSubscriber.confirmTokenHash, tokenHash))
    .limit(1)
  return rows[0] ?? null
}

export async function insertSubscriber(
  db: Database,
  values: NewNewsletterSubscriber,
): Promise<NewsletterSubscriberRow> {
  const now = new Date()
  const rows = await sqliteOf(db)
    .insert(newsletterSubscriber)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateSubscriber(
  db: Database,
  id: number,
  values: Partial<NewNewsletterSubscriber>,
): Promise<NewsletterSubscriberRow | null> {
  const rows = await sqliteOf(db)
    .update(newsletterSubscriber)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(newsletterSubscriber.id, id))
    .returning()
  return rows[0] ?? null
}
