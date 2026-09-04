import { lexicalStateToPlainText } from '@inkling/editor/headless'
import { createElement } from 'react'

import type { Database } from '@/server/infra/db/database'
import type { EntityTarget } from '@/server/infra/db/target'
import type { Comment, User } from '@/server/infra/db/types'
import type { SendResult } from '@/server/infra/email/types'
import type { CommentBody } from '@/shared/pt/comment-schema'
import type { CommentAndUser } from '@/shared/types/comments'

import { findEntitySlugTitle } from '@/server/domains/content/entities/slug-title'
import { commentBodyToHtml } from '@/server/domains/pt/services/comment-to-html'
import { sendAdminNotification } from '@/server/infra/email/admin-notification'
import { render } from '@/server/infra/email/render'
import { sendEmail } from '@/server/infra/email/sender'
import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'
import ApprovedComment from '@/server/infra/email/templates/ApprovedComment'
import NewReply from '@/server/infra/email/templates/NewReply'
import { getLogger } from '@/server/infra/logger'
import { computeCommentContentProjection } from '@/server/infra/pt/lexical-projection'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { entityCommentUrl } from '@/shared/utils/paths'
import { escapeHtml } from '@/shared/utils/security'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('comments.email')

/**
 * R12 interregnum shape gate: rows written before the Lexical switch still
 * hold PortableText bodies (legacy renderer — R14 drops that leg); Lexical
 * bodies project through the feed-variant degraded HTML (the email-friendly
 * audience). Render failure degrades to escaped plain text — a notification
 * email must never crash the comment flow.
 */
async function commentBodyEmailHtml(body: unknown): Promise<string> {
  if (Array.isArray(body)) {
    return commentBodyToHtml(unsafeCast<CommentBody>(body))
  }
  const state = unsafeCast<Parameters<typeof computeCommentContentProjection>[0]>(body)
  try {
    return await computeCommentContentProjection(state)
  } catch {
    return escapeHtml(lexicalStateToPlainText(state))
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
  const commentHtml = await commentBodyEmailHtml(commentInfo.body)
  if (entity === null) {
    log.warn('Skipping new-comment email: target entity not found', { target })
    return { ok: false, reason: 'unconfigured', message: '评论目标已不存在' }
  }
  return sendAdminNotification({
    subject: '有了新评论',
    element: createElement(AdminNotificationEmail, {
      preview: `在《${entity.title}》中有一条新留言`,
      title: '新留言',
      contextLine: { label: '留言文章：', link: { text: entity.title, href: entity.url } },
      mutedNote: commentInfo.isPending === true ? '该留言需要审核' : undefined,
      rows: [{ html: commentHtml }],
      cta: { label: '查看留言', href: `${entity.url}#user-comment-${commentInfo.id}` },
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
  const sourceHtml = await commentBodyEmailHtml(source.body)
  const replyHtml = await commentBodyEmailHtml(reply.body)
  if (entity === null) {
    log.warn('Skipping reply email: target entity not found', { target })
    return { ok: false, reason: 'unconfigured', message: '评论目标已不存在' }
  }
  const html = render(
    createElement(NewReply, {
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
    `您在【${requireBlogSettingsSection('siteIdentity').title}】的留言有了新回复`,
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
  const commentHtml = await commentBodyEmailHtml(comment.body)
  if (entity === null) {
    log.warn('Skipping approval email: target entity not found', { target })
    return { ok: false, reason: 'unconfigured', message: '评论目标已不存在' }
  }
  const html = render(
    createElement(ApprovedComment, {
      receiver: user.name,
      postTitle: entity.title,
      postLink: entity.url,
      commentContent: commentHtml,
      commentLink: `${entity.url}#user-comment-${comment.id}`,
    }),
  )
  return sendEmail(user.email, `您在【${requireBlogSettingsSection('siteIdentity').title}】的留言已经通过审核`, html)
}
