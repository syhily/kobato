import type { SessionUser } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'
import type { NotificationRow } from '@/server/infra/db/types'
import type {
  NotificationDto,
  NotificationSenderDto,
  NotificationTab,
  ThreadMessageDto,
} from '@/shared/contracts/notifications'

import {
  countUnreadNotifications,
  createNotificationWithRecipients,
  findRecipientRow,
  findUserNamesByIds,
  listNotificationsForUser,
  listRecipientUserIds,
  listThreadNotifications,
  listThreadParticipantIds,
  markNotificationsRead,
  type NewNotificationRow,
} from '@/server/infra/db/operations/notification'
import { DomainError } from '@/server/infra/http/errors'

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

function toNotificationDto(row: NotificationRow, sender: NotificationSenderDto | null, read: boolean): NotificationDto {
  return {
    id: String(row.id),
    threadId: String(row.threadId),
    kind: row.kind,
    title: row.title,
    body: row.body,
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

// ---------------------------------------------------------------------------
// Producers (system + admin)
// ---------------------------------------------------------------------------

export interface NotifyMessage {
  title: string
  body: string
  source?: string
  actionUrl?: string
}

function createAndFanOut(
  db: Database,
  data: NewNotificationRow & { threadId?: number },
  recipientIds: readonly number[],
): NotificationRow {
  // A message with zero recipients would be invisible forever — a producer bug.
  if (recipientIds.length === 0) {
    throw new DomainError('INTERNAL', '通知没有可投递的收件人')
  }
  return createNotificationWithRecipients(db, data, [...new Set(recipientIds)])
}

/** System → all current admins (boot cleanups, background-job results). Never replyable. */
export function notifyAdmins(db: Database, message: NotifyMessage): NotificationRow | null {
  const adminIds = listRecipientUserIds(db, { adminsOnly: true })
  if (adminIds.length === 0) {
    // Pre-install boot: nobody to notify yet, and no admin ever sees the
    // pre-install state — skipping is honest.
    return null
  }
  return createAndFanOut(
    db,
    {
      kind: 'admin',
      senderId: null,
      replyable: false,
      title: message.title,
      body: message.body,
      source: message.source ?? null,
      actionUrl: message.actionUrl ?? null,
    },
    adminIds,
  )
}

/** System → all users. Never replyable (the replyable flavor is admin-created). */
export function notifyAllUsers(db: Database, message: NotifyMessage): NotificationRow | null {
  const userIds = listRecipientUserIds(db, { adminsOnly: false })
  if (userIds.length === 0) {
    return null
  }
  return createAndFanOut(
    db,
    {
      kind: 'broadcast',
      senderId: null,
      replyable: false,
      title: message.title,
      body: message.body,
      source: message.source ?? null,
      actionUrl: message.actionUrl ?? null,
    },
    userIds,
  )
}

/** Admin → one user; always opens a replyable private thread. */
export function sendDirectMessage(
  db: Database,
  senderId: number,
  recipientId: number,
  input: { title: string; body: string },
): NotificationRow {
  const recipients = listRecipientUserIds(db, { adminsOnly: false })
  if (!recipients.includes(recipientId)) {
    throw new DomainError('NOT_FOUND', '目标用户不存在')
  }
  return createAndFanOut(db, { kind: 'direct', senderId, replyable: true, title: input.title, body: input.body }, [
    recipientId,
  ])
}

/** Admin → all users; the ONLY replyable broadcast flavor. The author never receives their own broadcast. */
export function sendBroadcast(
  db: Database,
  senderId: number,
  input: { title: string; body: string; replyable: boolean },
): NotificationRow {
  const userIds = listRecipientUserIds(db, { adminsOnly: false }).filter((id) => id !== senderId)
  return createAndFanOut(
    db,
    { kind: 'broadcast', senderId, replyable: input.replyable, title: input.title, body: input.body },
    userIds,
  )
}

// ---------------------------------------------------------------------------
// Inbox reads
// ---------------------------------------------------------------------------

export interface InboxPage {
  items: NotificationDto[]
  nextCursor: string | null
  unreadCount: number
}

export async function listInbox(
  db: Database,
  userId: number,
  input: { tab: NotificationTab; cursor?: number; limit: number },
): Promise<InboxPage> {
  const kinds =
    input.tab === 'direct'
      ? (['direct'] as const)
      : input.tab === 'announce'
        ? (['admin', 'broadcast'] as const)
        : undefined
  // One extra row as the has-more probe.
  const rows = await listNotificationsForUser(db, userId, {
    kinds,
    unreadOnly: input.tab === 'unread',
    cursorId: input.cursor,
    limit: input.limit + 1,
  })
  const page = rows.slice(0, input.limit)
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
      ),
    ),
    nextCursor: rows.length > input.limit ? String(page[page.length - 1]!.message.id) : null,
    unreadCount: countUnreadNotifications(db, userId),
  }
}

export function unreadCount(db: Database, userId: number): number {
  return countUnreadNotifications(db, userId)
}

/** `ids` omitted = mark everything read. */
export function markRead(db: Database, userId: number, ids?: readonly number[]): number {
  return markNotificationsRead(db, userId, ids)
}

// ---------------------------------------------------------------------------
// Threads & replies
// ---------------------------------------------------------------------------

async function loadThread(db: Database, threadId: number): Promise<NotificationRow[]> {
  const messages = await listThreadNotifications(db, threadId)
  if (messages.length === 0) {
    throw new DomainError('NOT_FOUND', '消息不存在')
  }
  return messages
}

function assertParticipant(db: Database, threadId: number, userId: number): number[] {
  const participants = listThreadParticipantIds(db, threadId)
  if (!participants.includes(userId)) {
    throw new DomainError('NOT_FOUND', '消息不存在')
  }
  return participants
}

/** The reply gate the list DTO's `replyable` mirrors: direct threads and admin-created replyable broadcasts. */
function canReplyInThread(root: NotificationRow): boolean {
  if (root.kind === 'direct') {
    return true
  }
  // System broadcasts ride senderId NULL; only an admin-created broadcast can
  // be answered, and only when its creator opted in.
  return root.kind === 'broadcast' && root.replyable && root.senderId !== null
}

export interface ThreadView {
  root: NotificationDto
  messages: ThreadMessageDto[]
  canReply: boolean
}

export async function getThread(db: Database, viewer: SessionUser, threadId: number): Promise<ThreadView> {
  const userId = Number(viewer.id)
  const messages = await loadThread(db, threadId)
  assertParticipant(db, threadId, userId)
  const root = messages[0]!
  const senders = senderDtosByIds(
    db,
    messages.map((row) => row.senderId).filter((id): id is number => id !== null),
  )
  const rootRecipient = findRecipientRow(db, root.id, userId)
  return {
    root: toNotificationDto(
      root,
      root.senderId !== null ? (senders.get(root.senderId) ?? null) : null,
      rootRecipient !== null && rootRecipient.readAt !== null,
    ),
    messages: messages.map((row) => ({
      id: String(row.id),
      body: row.body,
      sender: row.senderId !== null ? (senders.get(row.senderId) ?? null) : null,
      mine: row.senderId === userId,
      createdAt: row.createdAt.toISOString(),
    })),
    canReply: canReplyInThread(root),
  }
}

/**
 * Reply routing: direct threads answer the counterpart; a reply from a
 * non-admin inside an admin-created broadcast thread reaches ALL current
 * admins (plus prior participants); admin replies reach the thread's
 * participants. The reply itself is a `direct` message so the conversation
 * stays replyable end-to-end.
 */
export async function replyToThread(
  db: Database,
  viewer: SessionUser,
  input: { threadId: number; body: string },
): Promise<ThreadMessageDto> {
  const userId = Number(viewer.id)
  const messages = await loadThread(db, input.threadId)
  const root = messages[0]!
  const participants = assertParticipant(db, input.threadId, userId)
  if (!canReplyInThread(root)) {
    throw new DomainError('BAD_REQUEST', '该消息不支持回复')
  }
  const recipients = new Set(participants.filter((id) => id !== userId))
  if (viewer.role !== 'admin' && root.kind === 'broadcast') {
    for (const adminId of listRecipientUserIds(db, { adminsOnly: true })) {
      if (adminId !== userId) {
        recipients.add(adminId)
      }
    }
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
    [...recipients],
  )
  return {
    id: String(row.id),
    body: row.body,
    sender: { id: viewer.id, name: viewer.name },
    mine: true,
    createdAt: row.createdAt.toISOString(),
  }
}
