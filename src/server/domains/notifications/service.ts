import type { SessionUser } from '@/server/domains/auth/session-storage'
import type { SystemNotificationMessage } from '@/server/domains/notifications/message'
import type { Database } from '@/server/infra/db/database'
import type { NotificationRow } from '@/server/infra/db/types'
import type { ServerTranslator } from '@/server/infra/i18n'
import type {
  NotificationDto,
  NotificationKind,
  NotificationSenderDto,
  NotificationTab,
  ThreadMessageDto,
} from '@/shared/contracts/notifications'
import type { AppLocale } from '@/shared/i18n/locales'

import { queueNotificationEmail } from '@/server/domains/notifications/email'
import { encodeNotificationDescriptor, resolveNotificationMessage } from '@/server/domains/notifications/message'
import {
  countUnreadNotifications,
  createNotificationWithRecipients,
  findNotificationById,
  findUserNamesByIds,
  isActiveUserId,
  isThreadParticipant,
  listNotificationsForUser,
  listRecipientUserIds,
  listThreadNotifications,
  listThreadParticipantIds,
  markNotificationsRead,
  markNotificationsUnread,
  recallNotification,
  type NewNotificationRow,
} from '@/server/infra/db/operations/notification'
import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'
import { createServerTranslator } from '@/server/infra/i18n'
import { DEFAULT_LOCALE } from '@/shared/i18n/locales'

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

// The inbox row renders a two-line preview; the detail pane reads the full
// body from the thread query. Capping keeps the list wire small.
const LIST_BODY_PREVIEW_LENGTH = 200

function toNotificationDto(
  row: NotificationRow,
  sender: NotificationSenderDto | null,
  read: boolean,
  t: ServerTranslator,
): NotificationDto {
  // Preview and detail share ONE resolved message — the list only truncates it.
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

// ---------------------------------------------------------------------------
// Producers (system + admin)
// ---------------------------------------------------------------------------

function createAndFanOut(
  db: Database,
  data: NewNotificationRow & { threadId?: number },
  recipientIds: readonly number[],
  options?: { readRecipientIds?: readonly number[] },
): NotificationRow {
  // A message with zero recipients would be invisible forever — a producer bug.
  if (recipientIds.length === 0) {
    throw new DomainError('INTERNAL', descriptorFor('notifications.error.noRecipients'))
  }
  return createNotificationWithRecipients(db, data, [...new Set(recipientIds)], options)
}

/**
 * System → all current admins (boot cleanups, background-job results). Never
 * replyable. Takes an i18n descriptor (never prose): the row stores the English
 * fallback plus the key/params, and every reader sees its own locale.
 */
export function notifyAdmins(db: Database, message: SystemNotificationMessage): NotificationRow | null {
  const adminIds = listRecipientUserIds(db, { adminsOnly: true })
  if (adminIds.length === 0) {
    // Pre-install boot: nobody to notify yet, and no admin ever sees the
    // pre-install state — skipping is honest.
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

/** Admin → one user; always opens a replyable private thread. */
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

/**
 * Admin → all users; the ONLY replyable broadcast flavor. The author gets a
 * self-row, pre-marked read (ADR-0007): recall needs the author to see their
 * own broadcast, and it makes the inbox the single surface for "what did I
 * send". The empty-audience gate still counts OTHER users — a single-admin
 * site cannot send an announcement nobody would receive.
 */
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
  /** False for the second (no-op) call — the caller skips its audit row. */
  newlyRecalled: boolean
}

/**
 * Recall an announcement or a system alert (ADR-0007). `direct` messages are
 * deliberately NOT recallable — private threads between people stay honest.
 * Idempotent: a second call returns the existing state without re-stamping.
 */
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

// ---------------------------------------------------------------------------
// Inbox reads
// ---------------------------------------------------------------------------

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
  // One extra row as the has-more probe.
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

/** `ids` omitted = mark everything read. */
export function markRead(db: Database, userId: number, ids?: readonly number[]): number {
  return markNotificationsRead(db, userId, ids)
}

/** Return messages to the unread pile ("deal with this later"). */
export function markUnread(db: Database, userId: number, ids: readonly number[]): number {
  return markNotificationsUnread(db, userId, ids)
}

// ---------------------------------------------------------------------------
// Threads & replies
// ---------------------------------------------------------------------------

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

/**
 * The reply gate the list DTO's `replyable` mirrors. Direct threads are
 * always answerable. A broadcast root can only be answered by a NON-ADMIN
 * recipient (system broadcasts ride senderId NULL and can never be
 * answered) — admins answer inside the forked per-replier threads instead.
 * A recalled root accepts no NEW replies (ADR-0007) — defense in depth
 * behind the hidden UI entry; existing forks stay answerable.
 */
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
  // A recalled thread answers exactly like a missing one — existence is not
  // leaked to recipients, admins, or outsiders (ADR-0007).
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

/**
 * Reply routing. Direct threads answer the thread's participants minus the
 * replier (admin ↔ user conversation). A non-admin's reply in a replyable
 * admin-created broadcast FORKS a new private thread: the reply becomes its
 * own thread root (kind 'direct'), delivered to all current admins, with the
 * replier's own recipient row pre-marked read so the conversation is visible
 * in their inbox without inflating their badge. Admins answer inside the
 * fork, which keeps user feedback private to the admin team — the broadcast
 * root thread only ever contains the announcement itself.
 */
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
    // The role gate upstream refuses admins, so the replier is never in the list.
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
    // The replier's own pre-read row gets no mail; the admins receiving the
    // fork do (ADR-0008 — the fork is the admin-facing half of a reply).
    queueNotificationEmail(db, row, recipients)
    return {
      message: {
        id: String(row.id),
        body: row.body,
        sender: { id: viewer.id, name: viewer.name },
        mine: true,
        createdAt: row.createdAt.toISOString(),
      },
      // The fork's own thread — never the broadcast root the user replied to.
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
