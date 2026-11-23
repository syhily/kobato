import type {
  NotificationDto,
  NotificationKind,
  NotificationSenderDto,
  NotificationTab,
  ThreadMessageDto,
} from '@kobato/api/contracts/account/notifications'
import type { Database } from '@kobato/db/sqlite/database'
import type { NotificationRow } from '@kobato/db/sqlite/types'
import type { AppLocale } from '@kobato/i18n/locales'
import type { SessionUser } from '@kobato/server/domains/auth/session-storage'
import type { SystemNotificationMessage } from '@kobato/server/domains/notifications/message'
import type { ServerTranslator } from '@kobato/server/infra/i18n'

import {
  countUnreadNotifications,
  createNotificationWithRecipients,
  findNotificationById,
  listNotificationsForUser,
  listThreadNotifications,
  markNotificationsRead,
  markNotificationsUnread,
  recallNotification,
  type NewNotificationRow,
} from '@kobato/db/sqlite/operations/engagement/notification'
import {
  findUserNamesByIds,
  isActiveUserId,
  isThreadParticipant,
  listRecipientUserIds,
  listThreadParticipantIds,
} from '@kobato/db/sqlite/operations/engagement/notification-recipients'
import { DEFAULT_LOCALE } from '@kobato/i18n/locales'
import { queueNotificationEmail } from '@kobato/server/domains/notifications/email'
import { encodeNotificationDescriptor, resolveNotificationMessage } from '@kobato/server/domains/notifications/message'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { createServerTranslator } from '@kobato/server/infra/i18n'

const LIST_BODY_PREVIEW_LENGTH = 200

function toNotificationDto(
  row: NotificationRow,
  sender: NotificationSenderDto | null,
  read: boolean,
  t: ServerTranslator,
): NotificationDto {
  const resolved = resolveNotificationMessage(row, t)
  return {
    id: String(row.id),
    threadId: String(row.threadId),
    kind: row.kind,
    title: resolved.title,
    body: resolved.body.slice(0, LIST_BODY_PREVIEW_LENGTH),
    sender,
    replyable: row.replyable,
    source: row.source,
    actionUrl: row.actionUrl,
    createdAt: row.createdAt.toISOString(),
    read,
  }
}

function senderDtosByIds(db: Database, senderIds: Iterable<number>): Map<number, NotificationSenderDto> {
  const names = findUserNamesByIds(db, [...senderIds])
  return new Map([...names].map(([id, name]) => [id, { id: String(id), name }]))
}

function createAndFanOut(
  db: Database,
  data: NewNotificationRow & { threadId?: number },
  recipientIds: readonly number[],
  options?: { readRecipientIds?: readonly number[] },
): NotificationRow {
  if (recipientIds.length === 0) {
    throw new DomainError('INTERNAL', descriptorFor('notifications.error.noRecipients'))
  }
  return createNotificationWithRecipients(db, data, [...new Set(recipientIds)], options)
}

export function notifyAdmins(db: Database, message: SystemNotificationMessage): NotificationRow | null {
  const adminIds = listRecipientUserIds(db, { adminsOnly: true })
  if (adminIds.length === 0) {
    return null
  }
  const descriptor = encodeNotificationDescriptor(message)
  const row = createAndFanOut(
    db,
    {
      kind: 'admin',
      senderId: null,
      replyable: false,
      ...descriptor,
      source: message.source ?? null,
      actionUrl: message.actionUrl ?? null,
    },
    adminIds,
  )
  queueNotificationEmail(db, row, adminIds)
  return row
}

export function sendDirectMessage(
  db: Database,
  senderId: number,
  recipientId: number,
  input: { title: string; body: string },
): NotificationRow {
  if (recipientId === senderId) {
    throw new DomainError('BAD_REQUEST', descriptorFor('notifications.error.selfDirect'))
  }
  if (!isActiveUserId(db, recipientId)) {
    throw new DomainError('NOT_FOUND', descriptorFor('notifications.error.targetNotFound'))
  }
  const row = createAndFanOut(db, { kind: 'direct', senderId, replyable: true, title: input.title, body: input.body }, [
    recipientId,
  ])
  queueNotificationEmail(db, row, [recipientId])
  return row
}

export function sendBroadcast(
  db: Database,
  senderId: number,
  input: { title: string; body: string; replyable: boolean },
): NotificationRow {
  const userIds = listRecipientUserIds(db, { adminsOnly: false })
  if (userIds.every((id) => id === senderId)) {
    throw new DomainError('BAD_REQUEST', descriptorFor('notifications.error.noAudience'))
  }
  return createAndFanOut(
    db,
    { kind: 'broadcast', senderId, replyable: input.replyable, title: input.title, body: input.body },
    userIds,
    { readRecipientIds: [senderId] },
  )
}

export interface RecalledMessage {
  id: number
  kind: NotificationKind
  recalledAt: Date
  newlyRecalled: boolean
}

export function recallMessage(db: Database, id: number): RecalledMessage {
  const existing = findNotificationById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('notifications.error.messageNotFound'))
  }
  if (existing.kind === 'direct') {
    throw new DomainError('BAD_REQUEST', descriptorFor('notifications.error.recallDirect'))
  }
  const result = recallNotification(db, id)
  if (result === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('notifications.error.messageNotFound'))
  }
  return {
    id: result.row.id,
    kind: result.row.kind,
    recalledAt: result.row.recalledAt!,
    newlyRecalled: result.recalled,
  }
}

export interface InboxPage {
  items: NotificationDto[]
  nextCursor: string | null
}

export async function listInbox(
  db: Database,
  userId: number,
  input: { tab: NotificationTab; cursor?: number; limit: number; locale?: AppLocale },
): Promise<InboxPage> {
  const kinds =
    input.tab === 'direct'
      ? (['direct'] as const)
      : input.tab === 'announce'
        ? (['admin', 'broadcast'] as const)
        : undefined
  const rows = await listNotificationsForUser(db, userId, {
    kinds,
    unreadOnly: input.tab === 'unread',
    cursorId: input.cursor,
    limit: input.limit + 1,
  })
  const page = rows.slice(0, input.limit)
  const t = createServerTranslator(input.locale ?? DEFAULT_LOCALE)
  const senders = senderDtosByIds(
    db,
    page.map((row) => row.message.senderId).filter((id): id is number => id !== null),
  )
  return {
    items: page.map((row) =>
      toNotificationDto(
        row.message,
        row.message.senderId !== null ? (senders.get(row.message.senderId) ?? null) : null,
        row.recipient.readAt !== null,
        t,
      ),
    ),
    nextCursor: rows.length > input.limit ? String(page[page.length - 1]!.message.id) : null,
  }
}

export function unreadCount(db: Database, userId: number): number {
  return countUnreadNotifications(db, userId)
}

export function markRead(db: Database, userId: number, ids?: readonly number[]): number {
  return markNotificationsRead(db, userId, ids)
}

export function markUnread(db: Database, userId: number, ids: readonly number[]): number {
  return markNotificationsUnread(db, userId, ids)
}

async function loadThread(db: Database, threadId: number): Promise<NotificationRow[]> {
  const messages = await listThreadNotifications(db, threadId)
  if (messages.length === 0) {
    throw new DomainError('NOT_FOUND', descriptorFor('notifications.error.messageNotFound'))
  }
  return messages
}

function assertParticipant(db: Database, threadId: number, userId: number): void {
  if (!isThreadParticipant(db, threadId, userId)) {
    throw new DomainError('NOT_FOUND', descriptorFor('notifications.error.messageNotFound'))
  }
}

function canReplyInThread(root: NotificationRow, viewer: SessionUser): boolean {
  if (root.recalledAt !== null) {
    return false
  }
  if (root.kind === 'direct') {
    return true
  }
  return root.kind === 'broadcast' && root.replyable && root.senderId !== null && viewer.role !== 'admin'
}

export interface ThreadView {
  messages: ThreadMessageDto[]
  canReply: boolean
}

export async function getThread(
  db: Database,
  viewer: SessionUser,
  threadId: number,
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<ThreadView> {
  const userId = Number(viewer.id)
  const messages = await loadThread(db, threadId)
  const root = messages[0]!
  if (root.recalledAt !== null) {
    throw new DomainError('NOT_FOUND', descriptorFor('notifications.error.messageNotFound'))
  }
  assertParticipant(db, threadId, userId)
  const senders = senderDtosByIds(
    db,
    messages.map((row) => row.senderId).filter((id): id is number => id !== null),
  )
  const t = createServerTranslator(locale)
  return {
    messages: messages.map((row) => ({
      id: String(row.id),
      body: resolveNotificationMessage(row, t).body,
      sender: row.senderId !== null ? (senders.get(row.senderId) ?? null) : null,
      mine: row.senderId === userId,
      createdAt: row.createdAt.toISOString(),
    })),
    canReply: canReplyInThread(root, viewer),
  }
}

export async function replyToThread(
  db: Database,
  viewer: SessionUser,
  input: { threadId: number; body: string },
): Promise<{ message: ThreadMessageDto; threadId: number }> {
  const userId = Number(viewer.id)
  const messages = await loadThread(db, input.threadId)
  const root = messages[0]!
  assertParticipant(db, input.threadId, userId)
  if (!canReplyInThread(root, viewer)) {
    throw new DomainError('BAD_REQUEST', descriptorFor('notifications.error.notReplyable'))
  }
  if (root.kind === 'broadcast') {
    const recipients = listRecipientUserIds(db, { adminsOnly: true })
    if (recipients.length === 0) {
      throw new DomainError('BAD_REQUEST', descriptorFor('notifications.error.noAdminRecipients'))
    }
    const row = createAndFanOut(
      db,
      { kind: 'direct', senderId: userId, replyable: true, title: root.title, body: input.body },
      [...recipients, userId],
      { readRecipientIds: [userId] },
    )
    queueNotificationEmail(db, row, recipients)
    return {
      message: {
        id: String(row.id),
        body: row.body,
        sender: { id: viewer.id, name: viewer.name },
        mine: true,
        createdAt: row.createdAt.toISOString(),
      },
      threadId: row.threadId,
    }
  }
  const recipients = listThreadParticipantIds(db, input.threadId).filter((id) => id !== userId)
  if (recipients.length === 0) {
    throw new DomainError('BAD_REQUEST', descriptorFor('notifications.error.noThreadRecipients'))
  }
  const row = createAndFanOut(
    db,
    {
      kind: 'direct',
      senderId: userId,
      replyable: true,
      title: root.title,
      body: input.body,
      threadId: root.threadId,
    },
    recipients,
  )
  queueNotificationEmail(db, row, recipients)
  return {
    message: {
      id: String(row.id),
      body: row.body,
      sender: { id: viewer.id, name: viewer.name },
      mine: true,
      createdAt: row.createdAt.toISOString(),
    },
    threadId: root.threadId,
  }
}
