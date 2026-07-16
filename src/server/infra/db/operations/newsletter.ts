import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq } from 'drizzle-orm'

import type { NewNewsletterSubscriber, NewsletterSubscriberRow } from '@/server/infra/db/types'

import { newsletterSubscriber } from '@/server/infra/db/schema/newsletter'

export async function findSubscriberByEmail(
  db: NodePgDatabase,
  email: string,
): Promise<NewsletterSubscriberRow | null> {
  const rows = await db.select().from(newsletterSubscriber).where(eq(newsletterSubscriber.email, email)).limit(1)
  return rows[0] ?? null
}

export async function findSubscriberById(db: NodePgDatabase, id: bigint): Promise<NewsletterSubscriberRow | null> {
  const rows = await db.select().from(newsletterSubscriber).where(eq(newsletterSubscriber.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findSubscriberByConfirmTokenHash(
  db: NodePgDatabase,
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
  db: NodePgDatabase,
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
  db: NodePgDatabase,
  id: bigint,
  values: Partial<NewNewsletterSubscriber>,
): Promise<NewsletterSubscriberRow | null> {
  const rows = await db
    .update(newsletterSubscriber)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(newsletterSubscriber.id, id))
    .returning()
  return rows[0] ?? null
}
