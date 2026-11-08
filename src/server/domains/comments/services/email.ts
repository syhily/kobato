import { createElement } from 'react'

import type { Database } from '@/server/infra/db/database'
import type { EntityTarget } from '@/server/infra/db/target'
import type { Comment, User } from '@/server/infra/db/types'
import type { SendResult } from '@/server/infra/email/types'
import type { LexicalEditorState } from '@/shared/lexical/schema'
import type { PortableTextBody } from '@/shared/pt/schema'
import type { CommentAndUser } from '@/shared/types/comments'

import { lexicalStateToPlainText } from '@/inkling/headless'
import { findEntitySlugTitle } from '@/server/domains/content/entities/slug-title'
import { sendAdminNotification } from '@/server/infra/email/admin-notification'
import { render } from '@/server/infra/email/render'
import { sendEmail } from '@/server/infra/email/sender'
import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'
import ApprovedComment from '@/server/infra/email/templates/ApprovedComment'
import NewReply from '@/server/infra/email/templates/NewReply'
import { emailTranslator } from '@/server/infra/email/translator'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { bodyToPlainText } from '@/shared/pt/utils'
import { sanitizeHtmlString } from '@/shared/sanitize/sanitize-html'
import { entityCommentUrl } from '@/shared/utils/paths'
import { escapeHtml } from '@/shared/utils/security'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('comments.email')

/**
 * Allowlist sanitizer for the comment `content` column at the email boundary
 * (RawEmailHtml injects without sanitizing; the retired hand-rolled renderer
 * was safe by construction, the saved projection is not) — a thin wrapper
 * over the shared DOMPurify stack's 'comment-email' strategy
 * (src/shared/sanitize/config.ts owns the tag/attribute allowlist, which
 * mirrors the comment feed-variant projection's real output).
 */
function sanitizeCommentEmailHtml(html: string): string {
  return sanitizeHtmlString(html, 'comment-email')
}

/**
 * Email HTML for a comment row (R14): the saved `content` column IS the
 * feed-variant degraded-HTML projection computed at save time (R12), so the
 * mail path reads it directly — sanitized at this boundary. Legacy pre-R12
 * rows still carry a PortableText array body with a markdown `content`
 * snapshot; markdown is not email HTML, so those degrade to escaped plain
 * text until the R15 backfill converts them. A Lexical body with an empty
 * snapshot (should not happen — canonicalize falls back to plain text)
 * degrades to escaped plain text too. Never throws: a notification email
 * must never crash the comment flow.
 */
function commentBodyEmailHtml(comment: { body: unknown; content: string | null }): string {
  if (Array.isArray(comment.body)) {
    return escapeHtml(bodyToPlainText(unsafeCast<PortableTextBody>(comment.body)))
  }
  if (comment.content !== null && comment.content !== '') {
    return sanitizeCommentEmailHtml(comment.content)
  }
  return escapeHtml(lexicalStateToPlainText(unsafeCast<LexicalEditorState>(comment.body)))
}

async function resolveEntity(db: Database, target: EntityTarget): Promise<{ title: string; url: string } | null> {
  const entity = await findEntitySlugTitle(db, target)
  if (entity === null) {
    return null
  }
  return { title: entity.title, url: entityCommentUrl(target.type, entity.slug) }
}

export async function sendNewComment(
  db: Database,
  commentInfo: CommentAndUser,
  target: EntityTarget,
): Promise<SendResult> {
  const entity = await resolveEntity(db, target)
  const commentHtml = commentBodyEmailHtml(commentInfo)
  const t = emailTranslator()
  if (entity === null) {
    log.warn('Skipping new-comment email: target entity not found', { target })
    return { ok: false, reason: 'unconfigured', message: t.format('email.error.targetMissing') }
  }
  return sendAdminNotification({
    subject: t.format('email.newComment.subjectSuffix'),
    element: createElement(AdminNotificationEmail, {
      t,
      preview: t.format('email.newComment.preview', { title: entity.title }),
      title: t.format('email.newComment.title'),
      contextLine: { label: t.format('email.newComment.contextLabel'), link: { text: entity.title, href: entity.url } },
      mutedNote: commentInfo.isPending === true ? t.format('email.newComment.pendingNote') : undefined,
      rows: [{ html: commentHtml }],
      cta: { label: t.format('email.newComment.cta'), href: `${entity.url}#user-comment-${commentInfo.id}` },
    }),
  })
}

export async function sendNewReply(
  db: Database,
  sourceUser: User,
  source: Comment,
  reply: CommentAndUser,
  target: EntityTarget,
): Promise<SendResult> {
  const entity = await resolveEntity(db, target)
  const sourceHtml = commentBodyEmailHtml(source)
  const replyHtml = commentBodyEmailHtml(reply)
  const t = emailTranslator()
  if (entity === null) {
    log.warn('Skipping reply email: target entity not found', { target })
    return { ok: false, reason: 'unconfigured', message: t.format('email.error.targetMissing') }
  }
  const html = render(
    createElement(NewReply, {
      t,
      receiver: sourceUser.name,
      postTitle: entity.title,
      postLink: entity.url,
      sourceContent: sourceHtml,
      replyContent: replyHtml,
      replyLink: `${entity.url}#user-comment-${reply.id}`,
    }),
  )
  return sendEmail(
    sourceUser.email,
    t.format('email.newReply.subject', { siteTitle: requireBlogSettingsSection('siteIdentity').title }),
    html,
  )
}

export async function sendApprovedComment(
  db: Database,
  comment: Comment,
  user: User,
  target: EntityTarget,
): Promise<SendResult> {
  const entity = await resolveEntity(db, target)
  const commentHtml = commentBodyEmailHtml(comment)
  const t = emailTranslator()
  if (entity === null) {
    log.warn('Skipping approval email: target entity not found', { target })
    return { ok: false, reason: 'unconfigured', message: t.format('email.error.targetMissing') }
  }
  const html = render(
    createElement(ApprovedComment, {
      t,
      receiver: user.name,
      postTitle: entity.title,
      postLink: entity.url,
      commentContent: commentHtml,
      commentLink: `${entity.url}#user-comment-${comment.id}`,
    }),
  )
  return sendEmail(
    user.email,
    t.format('email.commentApproved.subject', { siteTitle: requireBlogSettingsSection('siteIdentity').title }),
    html,
  )
}
