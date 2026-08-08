import type { Database } from '@/server/infra/db/database'
import type { NewsletterSubscriberRow } from '@/server/infra/db/types'

import { sendConfirmSubscription } from '@/server/domains/newsletter/email'
import { signUnsubscribeId, verifyUnsubscribeSignature } from '@/server/domains/newsletter/signing'
import { generateToken, sha256, TOKEN_LEN_RE } from '@/server/infra/crypto/tokens'
import {
  findSubscriberByConfirmTokenHash,
  findSubscriberByEmail,
  findSubscriberById,
  insertSubscriber,
  updateSubscriber,
} from '@/server/infra/db/operations/newsletter'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsSection } from '@/shared/config/getters'

const log = getLogger('newsletter.service')

// Confirm tokens use the shared token primitives, stored as a sha256 hash;
// 24h TTL keeps pending rows from lingering indefinitely.
const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000
const CONFIRM_TTL_HOURS = CONFIRM_TTL_MS / (60 * 60 * 1000)

const INVALID_CONFIRM_MESSAGE = '确认链接无效或已过期，请重新订阅。'
const INVALID_UNSUBSCRIBE_MESSAGE = '退订链接无效。'

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function newsletterEnabled(): boolean {
  return requireBlogSettingsSection('newsletter').newsletter.enabled
}

function requireNewsletterEnabled(): void {
  if (!newsletterEnabled()) {
    throw new DomainError('BAD_REQUEST', '站点暂未开放邮件订阅。')
  }
}

// Confirm links are single-use (token hash cleared on confirm); unsubscribe
// links stay valid forever (re-click is a no-op).
export function buildConfirmUrl(token: string): string {
  const { website } = requireBlogSettingsSection('siteIdentity')
  return `${website}/newsletter/confirm?token=${encodeURIComponent(token)}`
}

export function buildUnsubscribeUrl(id: number): string {
  const { website } = requireBlogSettingsSection('siteIdentity')
  return `${website}/newsletter/unsubscribe?id=${id.toString()}&sig=${signUnsubscribeId(id)}`
}

/**
 * Create or rotate a `pending` subscriber and send the confirm email.
 * Confirmed rows are a silent no-op — never reveal subscription state.
 */
export async function subscribe(db: Database, rawEmail: string): Promise<void> {
  requireNewsletterEnabled()
  const email = normalizeEmail(rawEmail)
  const existing = await findSubscriberByEmail(db, email)
  if (existing?.status === 'confirmed') {
    return
  }

  const token = generateToken()
  const tokenHash = sha256(token)
  const expiresAt = new Date(Date.now() + CONFIRM_TTL_MS)

  if (existing === null) {
    await insertSubscriber(db, {
      email,
      status: 'pending',
      confirmTokenHash: tokenHash,
      confirmTokenExpiresAt: expiresAt,
    })
  } else {
    // Rotate to a fresh token — a third party can trigger the mail but never confirm it.
    await updateSubscriber(db, existing.id, {
      status: 'pending',
      confirmTokenHash: tokenHash,
      confirmTokenExpiresAt: expiresAt,
      confirmedAt: null,
      unsubscribedAt: null,
    })
  }

  const sent = await sendConfirmSubscription(email, buildConfirmUrl(token), CONFIRM_TTL_HOURS)
  if (!sent.ok) {
    // Keep the pending row — a re-subscribe rotates the token and retries.
    log.warn('Confirm email not sent', { email, reason: sent.reason })
    throw new DomainError('INTERNAL', '确认邮件发送失败，请稍后再试。')
  }
}

export async function confirm(db: Database, rawToken: string): Promise<NewsletterSubscriberRow> {
  requireNewsletterEnabled()
  if (!TOKEN_LEN_RE.test(rawToken)) {
    throw new DomainError('BAD_REQUEST', INVALID_CONFIRM_MESSAGE)
  }
  const row = await findSubscriberByConfirmTokenHash(db, sha256(rawToken))
  if (row === null || row.status !== 'pending') {
    throw new DomainError('BAD_REQUEST', INVALID_CONFIRM_MESSAGE)
  }
  if (row.confirmTokenExpiresAt === null || row.confirmTokenExpiresAt.getTime() < Date.now()) {
    throw new DomainError('BAD_REQUEST', INVALID_CONFIRM_MESSAGE)
  }
  const updated = await updateSubscriber(db, row.id, {
    status: 'confirmed',
    confirmTokenHash: null,
    confirmTokenExpiresAt: null,
    confirmedAt: new Date(),
    unsubscribedAt: null,
  })
  if (updated === null) {
    throw new DomainError('INTERNAL', '订阅确认失败，请稍后再试。')
  }
  return updated
}

/**
 * One-click unsubscribe, idempotent: unknown or already-unsubscribed rows
 * succeed silently; only a forged signature is rejected.
 */
export async function unsubscribe(db: Database, id: number, signature: string): Promise<void> {
  requireNewsletterEnabled()
  const row = await findSubscriberById(db, id)
  if (row === null) {
    return
  }
  if (!verifyUnsubscribeSignature(row.id, signature)) {
    throw new DomainError('BAD_REQUEST', INVALID_UNSUBSCRIBE_MESSAGE)
  }
  if (row.status === 'unsubscribed') {
    return
  }
  await updateSubscriber(db, row.id, {
    status: 'unsubscribed',
    confirmTokenHash: null,
    confirmTokenExpiresAt: null,
    unsubscribedAt: new Date(),
  })
}
