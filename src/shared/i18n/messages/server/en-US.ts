// Server-only messages (email, notifications, background jobs). These never
// enter the client bundle: the root loader ships `UiMessages` only.
//
// `email.*` keys are not persisted — they may be renamed as templates evolve.
// `notification.*` keys, once a producer writes them into a notification row,
// are append-only (rename/delete breaks rendering of rows already stored).
//
// English copy uses ASCII punctuation (no 【】《》「」 or full-width marks);
// `tests/unit/server/infra/email/email-messages.test.ts` enforces it for the
// catalog templates only — user-supplied values are legitimate in any script.

export const serverMessagesEnUS = {
  'email.common.automaticNotice': 'This email was sent automatically. Replies are not monitored.',
  'email.common.copyright': '<siteLink>{siteTitle}</siteLink> © {year}',
  'email.common.greeting': 'Hello {receiver},',
  'email.common.commentHistoryNote':
    'Want to view and manage all your past comments? Reset your password and sign in via this link:',
  'email.adminNotification.subject': '{siteTitle}: {subject}',
  'email.authorInvite.subject': '{siteTitle}: Author invitation',
  'email.authorInvite.preview': '{inviter} invited you to write for {siteTitle}',
  'email.authorInvite.title': '{inviter} invited you to become an author',
  'email.authorInvite.body':
    'You will get author permissions to publish and manage posts. Click the button below to accept the invitation (valid for 7 days).',
  'email.authorInvite.cta': 'Accept invitation',
  'email.authorInvite.ignore': 'If you did not expect this invitation, you can ignore this email.',
  'email.authorInvite.defaultInviter': 'An administrator',
  'email.passwordReset.subject': '{siteTitle}: Password reset',
  'email.passwordReset.preview': 'You requested a sign-in password reset; the link is valid for 15 minutes',
  'email.passwordReset.title': 'Reset your password',
  'email.passwordReset.body':
    'You requested a password reset. Click the button below to set a new password (valid for 15 minutes):',
  'email.passwordReset.cta': 'Reset password',
  'email.passwordReset.ignore': 'If you did not request a password reset, you can ignore this email.',
  'email.signInOtp.subject': '{siteTitle}: Sign-in verification code',
  'email.signInOtp.preview': 'Your sign-in code is {otpCode}; it expires in {expiresMinutes} minutes',
  'email.signInOtp.body': 'You are signing in to the admin panel. Enter the code below to continue:',
  'email.signInOtp.note':
    'The code expires in {expiresMinutes} minutes. Do not share it with anyone. If this was not you, you can ignore this email.',
  'email.signInLink.subject': '{siteTitle}: Sign-in link',
  'email.signInLink.preview': 'You requested a sign-in link; it expires in {expiresMinutes} minutes',
  'email.signInLink.title': 'Sign in to your account',
  'email.signInLink.body':
    'You requested to sign in. Click the button below to continue (valid for {expiresMinutes} minutes, single use):',
  'email.signInLink.cta': 'Sign in',
  'email.signInLink.ignore': 'If you did not request this sign-in, you can ignore this email.',
  'email.newsletterConfirm.subject': '{subjectPrefix}: Please confirm your email subscription',
  'email.newsletterConfirm.preview': 'Confirm your subscription to updates from {fromName}',
  'email.newsletterConfirm.title': 'Confirm your subscription',
  'email.newsletterConfirm.body':
    'You asked to subscribe to updates from {fromName}. Click the button below to confirm (valid for {expiresHours} hours):',
  'email.newsletterConfirm.cta': 'Confirm subscription',
  'email.newsletterConfirm.ignore':
    'If you did not request this subscription, you can ignore this email. You will not receive anything until you confirm.',
  'email.newReply.subject': 'Your comment on {siteTitle} received a new reply',
  'email.newReply.preview': 'Your comment in "{postTitle}" received a new reply',
  'email.newReply.title': 'Your comment received a new reply',
  'email.newReply.contextPrefix': 'Your comment in "',
  'email.newReply.contextSuffix': '" received a new reply',
  'email.newReply.sourceLabel': 'Your comment:',
  'email.newReply.replyLabel': 'Reply:',
  'email.newReply.cta': 'View reply',
  'email.commentApproved.subject': 'Your comment on {siteTitle} has been approved',
  'email.commentApproved.preview': 'Your comment in "{postTitle}" has been approved',
  'email.commentApproved.title': 'Your comment has been approved',
  'email.commentApproved.contextPrefix': 'Your comment in "',
  'email.commentApproved.contextSuffix': '" has been approved',
  'email.commentApproved.cta': 'View comment',
  'email.newComment.subjectSuffix': 'New comment',
  'email.newComment.preview': 'A new comment in "{title}"',
  'email.newComment.title': 'New comment',
  'email.newComment.contextLabel': 'Post:',
  'email.newComment.pendingNote': 'This comment needs review',
  'email.newComment.cta': 'View comment',
  'email.webmention.subjectSuffixNew': 'New Webmention received',
  'email.webmention.subjectSuffixUpdated': 'Webmention content updated; awaiting re-review',
  'email.webmention.previewNew': '"{title}" received a new Webmention',
  'email.webmention.previewUpdated': 'A Webmention for "{title}" was updated',
  'email.webmention.titleNew': 'New Webmention',
  'email.webmention.titleUpdated': 'Webmention updated',
  'email.webmention.contextLabel': 'Target post:',
  'email.webmention.mutedNoteNew': 'The mention passed source verification and is awaiting review',
  'email.webmention.mutedNoteUpdated':
    'The mention was updated and already passed source verification; it is awaiting re-review',
  'email.webmention.rowSource': 'Source:',
  'email.webmention.rowAuthor': 'Author:',
  'email.webmention.cta': 'View source',
  'email.friendApplication.subjectSuffix': 'New friend-link application',
  'email.friendApplication.preview': '"{website}" applied for a friend link',
  'email.friendApplication.title': 'New friend-link application',
  'email.friendApplication.mutedNote': 'The application is awaiting review; it appears publicly only after approval',
  'email.friendApplication.rowWebsite': 'Site:',
  'email.friendApplication.rowHomepage': 'Homepage:',
  'email.friendApplication.rowDescription': 'Description:',
  'email.friendApplication.rowRss': 'RSS:',
  'email.friendApplication.cta': 'Review it',
  'email.notification.adminSubject': '{siteTitle}: System alert: {title}',
  'email.notification.directSubject': 'You received a new direct message on {siteTitle}',
  'email.notification.adminTitle': 'System alert',
  'email.notification.directTitle': 'New direct message',
  'email.notification.rowTitle': 'Title:',
  'email.notification.rowBody': 'Content:',
  'email.notification.adminCta': 'Open the admin panel',
  'email.notification.directCta': 'Visit the site',
  'email.notification.footerNote':
    'This email was triggered by a system notification. You can turn notification emails off in Settings > Mail.',
  'email.testMail.subject': '{siteTitle}: Admin mail test',
  'email.testMail.introPrefix': 'This is a mail delivery test from the ',
  'email.testMail.introSuffix': ' admin panel.',
  'email.testMail.bodyOk': 'If you received this email, the mail service is configured correctly.',
  'email.testMail.labelSite': 'Site:',
  'email.testMail.labelSender': 'Sender:',
  'email.testMail.labelTriggered': 'Triggered at (UTC):',
  'email.error.disabled': 'Mail sending is turned off in the admin panel',
  'email.error.smtpUnconfigured':
    'The SMTP service is not fully configured (missing server address / username / password / sender)',
  'email.error.mailgunUnconfigured': 'The Mailgun service is not fully configured (missing domain / API key / sender)',
  'email.error.targetMissing': 'The comment target no longer exists',
  'notification.job.failed.title': 'Background task failed: {taskKey}',
  'notification.job.failed.body':
    'Task {taskKey} failed on its most recent run{hasError, select, yes {: {error}} other {.}} Open the Tasks page for details.',
  'notification.mail.zeaburCleanup.title': 'Mail sending was turned off automatically',
  'notification.mail.zeaburCleanup.body':
    'The Zeabur mail service is gone. This site still used it, so sending was turned off automatically. Reconfigure SMTP or Mailgun under Settings > Mail and turn it back on.',
  'notification.backup.cacheWipeFailed.title': 'Restored content is live, but cache cleanup failed',
  'notification.backup.cacheWipeFailed.body':
    'The restore has completed and the restored content is already in effect. Some revision-free cache entries may still be served until their normal TTL expires. Check the server log for details.',
} as const

export type ServerMessageId = keyof typeof serverMessagesEnUS

export type ServerMessages = Record<ServerMessageId, string>
