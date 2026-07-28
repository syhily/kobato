import { eq } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { NewNewsletterSubscriber, NewsletterSubscriberRow } from '@/server/infra/db/types'

import { newsletterSubscriber } from '@/server/infra/db/schema/newsletter'

export async function findSubscriberByEmail(db: Database, email: string): Promise<NewsletterSubscriberRow | null> {
  const rows = await db.select().from(newsletterSubscriber).where(eq(newsletterSubscriber.email, email)).limit(1)
  return rows[0] ?? null
}

export async function findSubscriberById(db: Database, id: number): Promise<NewsletterSubscriberRow | null> {
  const rows = await db.select().from(newsletterSubscriber).where(eq(newsletterSubscriber.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findSubscriberByConfirmTokenHash(
  db: Database,
  tokenHash: string,
): Promise<NewsletterSubscriberRow | null> {
  const rows = await db
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
  const rows = await db
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
  const rows = await db
    .update(newsletterSubscriber)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(newsletterSubscriber.id, id))
    .returning()
  return rows[0] ?? null
}
