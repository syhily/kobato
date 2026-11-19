import type { Database } from '@kobato/db/database.ts'
import type { EntityTarget } from '@kobato/db/target.ts'
import type { Comment, User } from '@kobato/db/types.ts'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema.ts'
import type { CommentAndUser } from '@kobato/server/domains/comments/types.ts'
import type { SendResult } from '@kobato/server/infra/email/types.ts'

import { lexicalStateToPlainText } from '@kobato/inkling/headless'
import { escapeHtml } from '@kobato/sanitize/escape-html.ts'
import { sanitizeHtmlString } from '@kobato/sanitize/sanitize-html.ts'
import { findEntitySlugTitle } from '@kobato/server/domains/content/entities/slug-title.ts'
import { entityCommentUrl } from '@kobato/server/domains/content/urls.ts'
import { sendAdminNotification } from '@kobato/server/infra/email/admin-notification.ts'
import { render } from '@kobato/server/infra/email/render.tsx'
import { sendEmail } from '@kobato/server/infra/email/sender.ts'
import { AdminNotificationEmail } from '@kobato/server/infra/email/templates/AdminNotificationEmail.tsx'
import ApprovedComment from '@kobato/server/infra/email/templates/ApprovedComment.tsx'
import NewReply from '@kobato/server/infra/email/templates/NewReply.tsx'
import { emailTranslator } from '@kobato/server/infra/email/translator.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { createElement } from 'react'

const log = getLogger('comments.email')

function sanitizeCommentEmailHtml(html: string): string {
  return sanitizeHtmlString(html, 'comment-email')
}

function commentBodyEmailHtml(comment: { body: unknown; content: string | null }): string {
  if (comment.content !== null && comment.content !== '') {
    return sanitizeCommentEmailHtml(comment.content)
  }
  try {
    return escapeHtml(lexicalStateToPlainText(unsafeCast<LexicalEditorState>(comment.body)))
  } catch {
    return ''
  }
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
