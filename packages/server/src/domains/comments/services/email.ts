import type { Database } from '@kobato/server/infra/db/database'
import type { EntityTarget } from '@kobato/server/infra/db/target'
import type { Comment, User } from '@kobato/server/infra/db/types'
import type { SendResult } from '@kobato/server/infra/email/types'
import type { CommentAndUser } from '@kobato/shared/types/comments'

import { readCommentBody } from '@kobato/server/domains/comments/projection'
import { findEntitySlugTitle } from '@kobato/server/domains/content/entities/slug-title'
import { sendAdminNotification } from '@kobato/server/infra/email/admin-notification'
import { render } from '@kobato/server/infra/email/render'
import { sendEmail } from '@kobato/server/infra/email/sender'
import { AdminNotificationEmail } from '@kobato/server/infra/email/templates/AdminNotificationEmail'
import ApprovedComment from '@kobato/server/infra/email/templates/ApprovedComment'
import NewReply from '@kobato/server/infra/email/templates/NewReply'
import { getLogger } from '@kobato/server/infra/logger'
import { lexicalCommentBodyToHtml } from '@kobato/server/render/lexical-html/comment-to-html'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { entityCommentUrl } from '@kobato/shared/utils/paths'
import { createElement } from 'react'

const log = getLogger('comments.email')

async function resolveEntity(db: Database, target: EntityTarget): Promise<{ title: string; url: string } | null> {
  const entity = await findEntitySlugTitle(db, target)
  if (entity === null) {
    return null
  }
  return { title: entity.title, url: entityCommentUrl(target.type, entity.slug) }
}

// Sent to the administrator whenever a new comment is posted.
export async function sendNewComment(
  db: Database,
  commentInfo: CommentAndUser,
  target: EntityTarget,
): Promise<SendResult> {
  const entity = await resolveEntity(db, target)
  const commentHtml = lexicalCommentBodyToHtml(readCommentBody(commentInfo.body), { mode: 'email' })
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

// Sent to the original commenter when one of their comments receives a reply.
export async function sendNewReply(
  db: Database,
  sourceUser: User,
  source: Comment,
  reply: CommentAndUser,
  target: EntityTarget,
): Promise<SendResult> {
  const entity = await resolveEntity(db, target)
  const sourceHtml = lexicalCommentBodyToHtml(readCommentBody(source.body), { mode: 'email' })
  const replyHtml = lexicalCommentBodyToHtml(readCommentBody(reply.body), { mode: 'email' })
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

// Sent to the commenter when an admin approves their previously pending comment.
export async function sendApprovedComment(
  db: Database,
  comment: Comment,
  user: User,
  target: EntityTarget,
): Promise<SendResult> {
  const entity = await resolveEntity(db, target)
  const commentHtml = lexicalCommentBodyToHtml(readCommentBody(comment.body), { mode: 'email' })
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
