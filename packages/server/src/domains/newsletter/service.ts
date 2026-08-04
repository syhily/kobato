import type { Database } from '@kobato/server/infra/db/database'
import type { NewsletterSubscriberRow } from '@kobato/server/infra/db/types'

import { sendConfirmSubscription } from '@kobato/server/domains/newsletter/email'
import { signUnsubscribeId, verifyUnsubscribeSignature } from '@kobato/server/domains/newsletter/signing'
import { generateToken, sha256, TOKEN_LEN_RE } from '@kobato/server/infra/crypto/tokens'
import {
  findSubscriberByConfirmTokenHash,
  findSubscriberByEmail,
  findSubscriberById,
  insertSubscriber,
  updateSubscriber,
} from '@kobato/server/infra/db/operations/newsletter'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'

const log = getLogger('newsletter.service')

// Double-opt-in confirm tokens use the shared token primitives
// (`@kobato/server/infra/crypto/tokens`): 43-char base64url, stored as a
// sha256 hash. 24h is generous enough for slow inboxes without leaving
// pending rows open indefinitely.
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

// Confirm links are single-use: the token hash is cleared on confirm, so
// a replayed link simply finds no row (same "invalid" surface as a bad
// token). Unsubscribe links stay valid forever — re-clicking one is a
// no-op on an already-unsubscribed row.
export function buildConfirmUrl(token: string): string {
  const { website } = requireBlogSettingsSection('siteIdentity')
  return `${website}/newsletter/confirm?token=${encodeURIComponent(token)}`
}

export function buildUnsubscribeUrl(id: number): string {
  const { website } = requireBlogSettingsSection('siteIdentity')
  return `${website}/newsletter/unsubscribe?id=${id.toString()}&sig=${signUnsubscribeId(id)}`
}

/**
 * Create a `pending` subscriber (or rotate the token of an existing
 * non-confirmed row) and send the confirmation email. Dedupe is by
 * normalized email; an already-`confirmed` row is a silent no-op so the
 * endpoint never reveals subscription state to a third party.
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
    // Re-subscribe from `pending` or `unsubscribed`: rotate the token and
    // move the row back to `pending`. Double-opt-in makes this safe — a
    // third party can trigger the confirm email but never confirm it.
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
    // The pending row stays — a later re-subscribe rotates the token and
    // retries once the mail pipeline is healthy again.
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
 * One-click unsubscribe. Idempotent by design: unknown ids and
 * already-unsubscribed rows both resolve as success (never 404 on a
 * re-click); only a forged signature is rejected.
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
