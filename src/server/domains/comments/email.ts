import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { createElement } from 'react'

import type { CommentAndUser } from '@/server/domains/comments/types'
import type { EntityTarget } from '@/server/infra/db/target'
import type { Comment, User } from '@/server/infra/db/types'

import { entityCommentUrl, findEntitySlugTitle } from '@/server/domains/comments/url'
import { commentBodyToHtml } from '@/server/domains/pt/comment-to-html'
import { renderEmail, sendEmail, type SendResult } from '@/server/infra/email/sender'
import ApprovedComment from '@/server/infra/email/templates/ApprovedComment'
import NewComment from '@/server/infra/email/templates/NewComment'
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
  const html = renderEmail(
    createElement(NewComment, {
      postTitle: entity.title,
      postLink: entity.url,
      commentNeedApproval: commentInfo.isPending === true,
      commentContent: commentHtml,
      commentLink: `${entity.url}#user-comment-${commentInfo.id}`,
    }),
  )
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  return sendEmail(siteIdentity.author.email, `您的网站【${siteIdentity.title}】有了新评论`, html)
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
  const html = renderEmail(
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
  const html = renderEmail(
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
