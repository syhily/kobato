import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { createElement } from 'react'

import type { EntityTarget } from '@/server/infra/db/target'
import type { Comment, User } from '@/server/infra/db/types'
import type { SendResult } from '@/server/infra/email/types'
import type { CommentAndUser } from '@/shared/types/comments'

import { entityCommentUrl, findEntitySlugTitle } from '@/server/domains/comments/services/shared'
import { commentBodyToHtml } from '@/server/domains/pt/services/comment-to-html'
import { sendAdminNotification } from '@/server/infra/email/admin-notification'
import { render } from '@/server/infra/email/render'
import { sendEmail } from '@/server/infra/email/sender'
import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'
import ApprovedComment from '@/server/infra/email/templates/ApprovedComment'
import NewReply from '@/server/infra/email/templates/NewReply'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsSection } from '@/shared/config/getters'

const log = getLogger('comments.email')

async function resolveEntity(db: NodePgDatabase, target: EntityTarget): Promise<{ title: string; url: string } | null> {
  const entity = await findEntitySlugTitle(db, target)
  if (entity === null) {
    return null
  }
  return { title: entity.title, url: entityCommentUrl(target.type, entity.slug) }
}

// Sent to the administrator whenever a new comment is posted.
export async function sendNewComment(
  db: NodePgDatabase,
  commentInfo: CommentAndUser,
  target: EntityTarget,
): Promise<SendResult> {
  const entity = await resolveEntity(db, target)
  const commentHtml = commentBodyToHtml(commentInfo.body)
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
  db: NodePgDatabase,
  sourceUser: User,
  source: Comment,
  reply: CommentAndUser,
  target: EntityTarget,
): Promise<SendResult> {
  const entity = await resolveEntity(db, target)
  const sourceHtml = commentBodyToHtml(source.body)
  const replyHtml = commentBodyToHtml(reply.body)
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
  db: NodePgDatabase,
  comment: Comment,
  user: User,
  target: EntityTarget,
): Promise<SendResult> {
  const entity = await resolveEntity(db, target)
  const commentHtml = commentBodyToHtml(comment.body)
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
