import type { AnyContractProcedure } from '@orpc/contract'

import { adminAuditLogContract } from '@kobato/api/admin/audit-log.ts'
import { adminBackupContract } from '@kobato/api/admin/backup.ts'
import { adminCacheContract } from '@kobato/api/admin/cache.ts'
import { adminCategoriesContract } from '@kobato/api/admin/categories.ts'
import { adminCommentsContract } from '@kobato/api/admin/comments.ts'
import { adminFontsContract } from '@kobato/api/admin/fonts.ts'
import { adminFriendsContract } from '@kobato/api/admin/friends.ts'
import { adminGeoipContract } from '@kobato/api/admin/geoip.ts'
import { adminImagesContract } from '@kobato/api/admin/images.ts'
import { adminJobsContract } from '@kobato/api/admin/jobs.ts'
import { adminMailContract } from '@kobato/api/admin/mail.ts'
import { adminMusicContract } from '@kobato/api/admin/music.ts'
import { adminNotificationsContract } from '@kobato/api/admin/notifications.ts'
import { adminObservabilityContract } from '@kobato/api/admin/observability.ts'
import { adminPagesContract } from '@kobato/api/admin/pages.ts'
import { adminPostsContract } from '@kobato/api/admin/posts.ts'
import { adminRendersContract } from '@kobato/api/admin/renders.ts'
import { revisionContract } from '@kobato/api/admin/revision.ts'
import { adminSettingsContract } from '@kobato/api/admin/settings.ts'
import { adminStorageContract } from '@kobato/api/admin/storage.ts'
import { adminTagsContract } from '@kobato/api/admin/tags.ts'
import { adminUpdateContract } from '@kobato/api/admin/update.ts'
import {
  adminUsersAdminContract,
  adminUsersContract,
  adminUsersCrudContract,
  adminUsersSessionsContract,
} from '@kobato/api/admin/users.ts'
import { adminWebmentionsContract } from '@kobato/api/admin/webmentions.ts'
import { contentRestoreResultDto } from '@kobato/contracts/admin-meta.ts'
import {
  adminPostAnalyticsInputSchema,
  adminPostAnalyticsOutputSchema,
  adminPostsMySummaryOutputSchema,
  adminSettingsBootstrapOutputSchema,
  adminSettingsUpdateInput,
  adminSettingsUpdateOutput,
  adminUserUpdateInput,
  adminUsersCountOutputSchema,
  adminUsersListSessionsOutputSchema,
  adminUsersPasskeyFlagOutputSchema,
  adminCommentsPendingCountOutputSchema,
  adminWebmentionsPendingCountOutputSchema,
} from '@kobato/contracts/admin.ts'
import {
  auditLogActorsOutput,
  auditLogExportInput,
  auditLogExportOutput,
  auditLogListInput,
  auditLogListOutput,
} from '@kobato/contracts/audit.ts'
import {
  adminBackupCreateInput,
  adminBackupCreateOutputDto,
  adminBackupDeleteInput,
  adminBackupListInput,
  adminBackupListOutputDto,
  adminBackupRestoreInput,
  adminBackupRestoreOutputDto,
  adminBackupStatusOutputDto,
} from '@kobato/contracts/backup.ts'
import {
  adminCacheClearInput,
  adminCacheGetStatsInput,
  adminCacheStatsDto,
  clearCacheResultDto,
} from '@kobato/contracts/cache.ts'
import {
  adminCategoriesListInput,
  adminCategoriesListOutputDto,
  adminCategoriesReorderInput,
  adminCategoriesReorderOutputDto,
  adminCategoryIdInput,
  adminCategoryUpsertInput,
  adminCategoryUpsertOutputDto,
} from '@kobato/contracts/categories.ts'
import {
  adminAvatarMirrorProbeOutputDto,
  adminCommentApproveDeletionInput,
  adminCommentApproveDeletionOutputDto,
  adminCommentEditInput,
  adminCommentFilterAutocompleteInput,
  adminCommentIdInput,
  adminCommentSearchAuthorsOutputDto,
  adminCommentSearchPagesOutputDto,
  adminCommentsLoadAllInput,
  adminCommentsLoadAllOutputDto,
  adminCommentsPendingDashboardInput,
  adminPendingDashboardDto,
  ownCommentMutationDto,
} from '@kobato/contracts/comments.ts'
import {
  adminFontDeleteInput,
  adminFontDeleteOutputDto,
  adminFontsListInput,
  adminFontSetSlotOutputDto,
  listFontsOutputDto,
  setFontSlotInputDto,
} from '@kobato/contracts/fonts.ts'
import {
  adminFriendUpsertOutputDto,
  adminFriendsListOutputDto,
  friendIdSchema,
  listFriendsSchema,
  upsertFriendSchema,
} from '@kobato/contracts/friends.ts'
import {
  adminGeoipStatusInput,
  adminGeoipStatusOutputDto,
  adminGeoipUpdateInput,
  adminGeoipUpdateOutputDto,
} from '@kobato/contracts/geoip.ts'
import {
  adminImageIdInput,
  adminImageMutationOutputDto,
  adminImageNoteInput,
  adminImageUploadInput,
  adminImagesListInput,
  listImagesOutputDto,
} from '@kobato/contracts/images.ts'
import { jobHistoryInput, jobHistoryOutput, jobsListDto } from '@kobato/contracts/jobs.ts'
import { adminMailSendTestInput, adminMailSendTestOutputDto } from '@kobato/contracts/mail.ts'
import {
  addMusicOutputDto,
  adminMusicAddInput,
  adminMusicIdInput,
  adminMusicListInput,
  adminMusicSearchInput,
  adminMusicUpdateInput,
  getMusicOutputDto,
  listMusicOutputDto,
  searchMusicOutputDto,
  updateMusicOutputDto,
} from '@kobato/contracts/music.ts'
import {
  adminRecallNotificationInput,
  adminRecallNotificationOutput,
  adminSendBroadcastInput,
  adminSendDirectInput,
  adminSendOutput,
} from '@kobato/contracts/notifications.ts'
import {
  observabilityProvisionInputSchema,
  observabilityProvisionOutputSchema,
  observabilityStatusInputSchema,
  observabilityStatusOutputSchema,
  observabilityTestConnectionInputSchema,
  observabilityTestConnectionOutputSchema,
} from '@kobato/contracts/observability.ts'
import {
  adminPageDetailDto,
  adminPageIdInput,
  adminPageUnpublishOutputDto,
  adminPageUpsertMetaOutputDto,
  listPageRevisionsOutputDto,
  listPagesOutputDto,
  listPagesSchema,
  upsertPageMetaSchema,
} from '@kobato/contracts/pages.ts'
import {
  adminPostDetailDto,
  adminPostIdInput,
  adminPostUnpublishOutputDto,
  adminPostUpsertMetaOutputDto,
  listPostRevisionsOutputDto,
  listPostsOutputDto,
  listPostsSchema,
  upsertPostMetaSchema,
} from '@kobato/contracts/posts.ts'
import { successDto, voidOutput } from '@kobato/contracts/primitives.ts'
import {
  adminRenderBatchInput,
  adminRenderMathInput,
  adminRenderMathOutputDto,
  adminRenderReindexOutputDto,
  adminRenderReprojectOutputDto,
} from '@kobato/contracts/renders.ts'
import { saveBodyInput, saveResultOutput } from '@kobato/contracts/revision.ts'
import {
  adminStorageStartMigrationInput,
  adminStorageStatsOutputDto,
  storageMigrationStatusDto,
} from '@kobato/contracts/storage.ts'
import {
  adminTagsListInput,
  adminTagsListOutputDto,
  adminTagIdInput,
  adminTagUpsertInput,
  adminTagUpsertOutputDto,
} from '@kobato/contracts/tags.ts'
import {
  adminUpdateApplyInput,
  adminUpdateApplyOutputDto,
  adminUpdateCheckInput,
  adminUpdateStatusInput,
  updateCheckResultDto,
  updateJobStatusDto,
} from '@kobato/contracts/update.ts'
import {
  adminBulkApproveCommentsOutputDto,
  adminBulkDeleteCommentsOutputDto,
  adminRevokeSessionInput,
  adminRevokeSessionOutputDto,
  adminUserClearPasskeysInput,
  adminUserEnvelopeDto,
  adminUserIdInput,
  adminUserIdParamInput,
  adminUserInviteAuthorInput,
  adminUserMuteInput,
  adminUserSendPasswordResetInput,
  adminUserUpdateRoleInput,
  adminUserUpdateRoleOutputDto,
  adminUsersListInput,
  adminUsersListOutputDto,
} from '@kobato/contracts/users.ts'
import {
  adminWebmentionDto,
  adminWebmentionIdInput,
  adminWebmentionListSchema,
  adminWebmentionOutboxListSchema,
  adminWebmentionOutboxOutputDto,
  adminWebmentionsLoadAllOutputDto,
} from '@kobato/contracts/webmentions.ts'
import { isContractProcedure } from '@orpc/contract'
import { describe, expect, it } from 'vitest'

/** The deployed admin wire surface — drift here is a breaking URL change. */
const ADMIN_ROUTES = {
  posts: {
    list: { method: 'GET', path: '/admin/posts/list' },
    get: { method: 'GET', path: '/admin/posts/get' },
    delete: { method: 'POST', path: '/admin/posts/remove' },
    restore: { method: 'POST', path: '/admin/posts/restore' },
    unpublish: { method: 'POST', path: '/admin/posts/unpublish' },
    saveDraft: { method: 'POST', path: '/admin/posts/save-draft' },
    publishLatest: { method: 'POST', path: '/admin/posts/publish-latest' },
    upsertMeta: { method: 'POST', path: '/admin/posts/upsert-meta' },
    listRevisions: { method: 'GET', path: '/admin/posts/list-revisions' },
    mySummary: { method: 'GET', path: '/admin/posts/my-summary' },
    analytics: { method: 'GET', path: '/admin/posts/analytics' },
  },
  pages: {
    list: { method: 'GET', path: '/admin/pages/list' },
    get: { method: 'GET', path: '/admin/pages/get' },
    delete: { method: 'POST', path: '/admin/pages/remove' },
    restore: { method: 'POST', path: '/admin/pages/restore' },
    unpublish: { method: 'POST', path: '/admin/pages/unpublish' },
    saveDraft: { method: 'POST', path: '/admin/pages/save-draft' },
    publishLatest: { method: 'POST', path: '/admin/pages/publish-latest' },
    upsertMeta: { method: 'POST', path: '/admin/pages/upsert-meta' },
    listRevisions: { method: 'GET', path: '/admin/pages/list-revisions' },
  },
  users: {
    count: { method: 'GET', path: '/admin/users/count' },
    passkeyFlag: { method: 'GET', path: '/admin/users/passkey-flag' },
    list: { method: 'GET', path: '/admin/users/list' },
    get: { method: 'GET', path: '/admin/users/get' },
    update: { method: 'POST', path: '/admin/users/update' },
    softDelete: { method: 'POST', path: '/admin/users/soft-delete' },
    restore: { method: 'POST', path: '/admin/users/restore' },
    mute: { method: 'POST', path: '/admin/users/mute' },
    updateRole: { method: 'POST', path: '/admin/users/update-role' },
    inviteAuthor: { method: 'POST', path: '/admin/users/invite-author' },
    sendPasswordReset: { method: 'POST', path: '/admin/users/send-password-reset' },
    clearPasskeys: { method: 'POST', path: '/admin/users/clear-passkeys' },
    listSessions: { method: 'GET', path: '/admin/users/list-sessions' },
    revokeSession: { method: 'POST', path: '/admin/users/revoke-session' },
    revokeAllSessions: { method: 'POST', path: '/admin/users/revoke-all-sessions' },
    bulkApproveComments: { method: 'POST', path: '/admin/users/bulk-approve-comments' },
    bulkDeleteComments: { method: 'POST', path: '/admin/users/bulk-delete-comments' },
  },
  auditLog: {
    list: { method: 'GET', path: '/admin/audit-log/list' },
    exportCsv: { method: 'POST', path: '/admin/audit-log/export' },
    actors: { method: 'GET', path: '/admin/audit-log/actors' },
  },
  settings: {
    update: { method: 'POST', path: '/admin/settings/update' },
    bootstrap: { method: 'GET', path: '/admin/settings/bootstrap' },
  },
  storage: {
    stats: { method: 'GET', path: '/admin/storage/migration-stats' },
    migrationStatus: { method: 'GET', path: '/admin/storage/migration-status' },
    startMigration: { method: 'POST', path: '/admin/storage/migration/start' },
    cancelMigration: { method: 'POST', path: '/admin/storage/migration/cancel' },
    resumeMigration: { method: 'POST', path: '/admin/storage/migration/resume' },
  },
  cache: {
    getStats: { method: 'GET', path: '/admin/cache/get-stats' },
    clear: { method: 'POST', path: '/admin/cache/clear' },
  },
  mail: {
    sendTest: { method: 'POST', path: '/admin/mail/send-test' },
  },
  friends: {
    list: { method: 'GET', path: '/admin/friends/list' },
    upsert: { method: 'POST', path: '/admin/friends/upsert' },
    delete: { method: 'POST', path: '/admin/friends/remove' },
  },
  categories: {
    list: { method: 'GET', path: '/admin/categories/list' },
    upsert: { method: 'POST', path: '/admin/categories/upsert' },
    delete: { method: 'POST', path: '/admin/categories/remove' },
    reorder: { method: 'POST', path: '/admin/categories/reorder' },
  },
  tags: {
    list: { method: 'GET', path: '/admin/tags/list' },
    upsert: { method: 'POST', path: '/admin/tags/upsert' },
    delete: { method: 'POST', path: '/admin/tags/remove' },
  },
  images: {
    list: { method: 'GET', path: '/admin/images/list' },
    delete: { method: 'POST', path: '/admin/images/remove' },
    updateNote: { method: 'POST', path: '/admin/images/update-note' },
    recalculateThumbhash: { method: 'POST', path: '/admin/images/recalculate-thumbhash' },
    upload: { method: 'POST', path: '/admin/images/upload' },
  },
  jobs: {
    list: { method: 'GET', path: '/admin/jobs/list' },
    history: { method: 'GET', path: '/admin/jobs/history' },
  },
  music: {
    list: { method: 'GET', path: '/admin/music/list' },
    search: { method: 'GET', path: '/admin/music/search' },
    add: { method: 'POST', path: '/admin/music/add' },
    get: { method: 'GET', path: '/admin/music/get' },
    update: { method: 'POST', path: '/admin/music/update' },
    delete: { method: 'POST', path: '/admin/music/remove' },
  },
  notifications: {
    sendDirect: { method: 'POST', path: '/admin/notifications/send-direct' },
    sendBroadcast: { method: 'POST', path: '/admin/notifications/send-broadcast' },
    recall: { method: 'POST', path: '/admin/notifications/recall' },
  },
  observability: {
    testConnection: { method: 'POST', path: '/admin/observability/test-connection' },
    provision: { method: 'POST', path: '/admin/observability/provision' },
    status: { method: 'GET', path: '/admin/observability/status' },
  },
  renders: {
    math: { method: 'POST', path: '/admin/renders/math' },
    reindexSearch: { method: 'POST', path: '/admin/renders/reindex-search' },
    reprojectBodies: { method: 'POST', path: '/admin/renders/reproject-bodies' },
  },
  // The deployed moderation paths are the legacy `/comment-admin/*` surface.
  comments: {
    approve: { method: 'POST', path: '/comment-admin/approve' },
    delete: { method: 'POST', path: '/comment-admin/delete' },
    edit: { method: 'POST', path: '/comment-admin/edit' },
    loadAll: { method: 'GET', path: '/comment-admin/load-all' },
    searchPages: { method: 'GET', path: '/comment-admin/search-pages' },
    searchAuthors: { method: 'GET', path: '/comment-admin/search-authors' },
    approveCommentDeletion: { method: 'POST', path: '/comment-admin/approve-comment-deletion' },
    listPendingDashboard: { method: 'GET', path: '/comment-admin/list-pending-dashboard' },
    pendingCount: { method: 'GET', path: '/comment-admin/pending-count' },
    probeAvatarMirrors: { method: 'GET', path: '/comment-admin/probe-avatar-mirrors' },
  },
  backup: {
    status: { method: 'GET', path: '/admin/backup/status' },
    list: { method: 'GET', path: '/admin/backup/list' },
    create: { method: 'POST', path: '/admin/backup/create' },
    restore: { method: 'POST', path: '/admin/backup/restore' },
    delete: { method: 'POST', path: '/admin/backup/delete' },
  },
  fonts: {
    list: { method: 'GET', path: '/admin/fonts/list' },
    delete: { method: 'POST', path: '/admin/fonts/delete' },
    setSlot: { method: 'POST', path: '/admin/fonts/set-slot' },
  },
  geoip: {
    status: { method: 'GET', path: '/admin/geoip/status' },
    update: { method: 'POST', path: '/admin/geoip/update' },
  },
  // Same for webmentions: the deployed surface is `/webmention-admin/*`.
  webmentions: {
    loadAll: { method: 'GET', path: '/webmention-admin/load-all' },
    approve: { method: 'POST', path: '/webmention-admin/approve' },
    reject: { method: 'POST', path: '/webmention-admin/reject' },
    reverify: { method: 'POST', path: '/webmention-admin/reverify' },
    outbox: { method: 'GET', path: '/webmention-admin/outbox' },
    pendingCount: { method: 'GET', path: '/webmention-admin/pending-count' },
  },
  update: {
    check: { method: 'GET', path: '/admin/update/check' },
    apply: { method: 'POST', path: '/admin/update/apply' },
    status: { method: 'GET', path: '/admin/update/status' },
  },
} as const

/** Each procedure's input/output, pinned by OBJECT IDENTITY to the exported
 *  `@kobato/contracts` schemas — a contract composes, never copies. `input:
 *  undefined` pins the deliberately input-less procedures. */
const ADMIN_SCHEMAS = {
  posts: {
    list: { input: listPostsSchema, output: listPostsOutputDto },
    get: { input: adminPostIdInput, output: adminPostDetailDto },
    delete: { input: adminPostIdInput, output: voidOutput },
    restore: { input: adminPostIdInput, output: contentRestoreResultDto },
    unpublish: { input: adminPostIdInput, output: adminPostUnpublishOutputDto },
    saveDraft: { input: saveBodyInput, output: saveResultOutput },
    publishLatest: { input: saveBodyInput, output: saveResultOutput },
    upsertMeta: { input: upsertPostMetaSchema, output: adminPostUpsertMetaOutputDto },
    listRevisions: { input: adminPostIdInput, output: listPostRevisionsOutputDto },
    mySummary: { input: undefined, output: adminPostsMySummaryOutputSchema },
    analytics: { input: adminPostAnalyticsInputSchema, output: adminPostAnalyticsOutputSchema },
  },
  pages: {
    list: { input: listPagesSchema, output: listPagesOutputDto },
    get: { input: adminPageIdInput, output: adminPageDetailDto },
    delete: { input: adminPageIdInput, output: voidOutput },
    restore: { input: adminPageIdInput, output: contentRestoreResultDto },
    unpublish: { input: adminPageIdInput, output: adminPageUnpublishOutputDto },
    saveDraft: { input: saveBodyInput, output: saveResultOutput },
    publishLatest: { input: saveBodyInput, output: saveResultOutput },
    upsertMeta: { input: upsertPageMetaSchema, output: adminPageUpsertMetaOutputDto },
    listRevisions: { input: adminPageIdInput, output: listPageRevisionsOutputDto },
  },
  users: {
    count: { input: undefined, output: adminUsersCountOutputSchema },
    passkeyFlag: { input: undefined, output: adminUsersPasskeyFlagOutputSchema },
    list: { input: adminUsersListInput, output: adminUsersListOutputDto },
    get: { input: adminUserIdInput, output: adminUserEnvelopeDto },
    update: { input: adminUserUpdateInput, output: successDto },
    softDelete: { input: adminUserIdInput, output: voidOutput },
    restore: { input: adminUserIdInput, output: successDto },
    mute: { input: adminUserMuteInput, output: adminUserEnvelopeDto },
    updateRole: { input: adminUserUpdateRoleInput, output: adminUserUpdateRoleOutputDto },
    inviteAuthor: { input: adminUserInviteAuthorInput, output: successDto },
    sendPasswordReset: { input: adminUserSendPasswordResetInput, output: successDto },
    clearPasskeys: { input: adminUserClearPasskeysInput, output: adminUserEnvelopeDto },
    listSessions: { input: undefined, output: adminUsersListSessionsOutputSchema },
    revokeSession: { input: adminRevokeSessionInput, output: adminRevokeSessionOutputDto },
    revokeAllSessions: { input: adminUserIdParamInput, output: successDto },
    bulkApproveComments: { input: adminUserIdParamInput, output: adminBulkApproveCommentsOutputDto },
    bulkDeleteComments: { input: adminUserIdParamInput, output: adminBulkDeleteCommentsOutputDto },
  },
  auditLog: {
    list: { input: auditLogListInput, output: auditLogListOutput },
    exportCsv: { input: auditLogExportInput, output: auditLogExportOutput },
    actors: { input: undefined, output: auditLogActorsOutput },
  },
  settings: {
    update: { input: adminSettingsUpdateInput, output: adminSettingsUpdateOutput },
    bootstrap: { input: undefined, output: adminSettingsBootstrapOutputSchema },
  },
  storage: {
    stats: { input: undefined, output: adminStorageStatsOutputDto },
    migrationStatus: { input: undefined, output: storageMigrationStatusDto },
    startMigration: { input: adminStorageStartMigrationInput, output: storageMigrationStatusDto },
    cancelMigration: { input: undefined, output: storageMigrationStatusDto },
    resumeMigration: { input: undefined, output: storageMigrationStatusDto },
  },
  cache: {
    getStats: { input: adminCacheGetStatsInput, output: adminCacheStatsDto },
    clear: { input: adminCacheClearInput, output: clearCacheResultDto },
  },
  mail: {
    sendTest: { input: adminMailSendTestInput, output: adminMailSendTestOutputDto },
  },
  friends: {
    list: { input: listFriendsSchema, output: adminFriendsListOutputDto },
    upsert: { input: upsertFriendSchema, output: adminFriendUpsertOutputDto },
    delete: { input: friendIdSchema, output: voidOutput },
  },
  categories: {
    list: { input: adminCategoriesListInput, output: adminCategoriesListOutputDto },
    upsert: { input: adminCategoryUpsertInput, output: adminCategoryUpsertOutputDto },
    delete: { input: adminCategoryIdInput, output: voidOutput },
    reorder: { input: adminCategoriesReorderInput, output: adminCategoriesReorderOutputDto },
  },
  tags: {
    list: { input: adminTagsListInput, output: adminTagsListOutputDto },
    upsert: { input: adminTagUpsertInput, output: adminTagUpsertOutputDto },
    delete: { input: adminTagIdInput, output: voidOutput },
  },
  images: {
    list: { input: adminImagesListInput, output: listImagesOutputDto },
    delete: { input: adminImageIdInput, output: voidOutput },
    updateNote: { input: adminImageNoteInput, output: adminImageMutationOutputDto },
    recalculateThumbhash: { input: adminImageIdInput, output: adminImageMutationOutputDto },
    upload: { input: adminImageUploadInput, output: adminImageMutationOutputDto },
  },
  jobs: {
    list: { input: undefined, output: jobsListDto },
    history: { input: jobHistoryInput, output: jobHistoryOutput },
  },
  music: {
    list: { input: adminMusicListInput, output: listMusicOutputDto },
    search: { input: adminMusicSearchInput, output: searchMusicOutputDto },
    add: { input: adminMusicAddInput, output: addMusicOutputDto },
    get: { input: adminMusicIdInput, output: getMusicOutputDto },
    update: { input: adminMusicUpdateInput, output: updateMusicOutputDto },
    delete: { input: adminMusicIdInput, output: voidOutput },
  },
  notifications: {
    sendDirect: { input: adminSendDirectInput, output: adminSendOutput },
    sendBroadcast: { input: adminSendBroadcastInput, output: adminSendOutput },
    recall: { input: adminRecallNotificationInput, output: adminRecallNotificationOutput },
  },
  observability: {
    testConnection: { input: observabilityTestConnectionInputSchema, output: observabilityTestConnectionOutputSchema },
    provision: { input: observabilityProvisionInputSchema, output: observabilityProvisionOutputSchema },
    status: { input: observabilityStatusInputSchema, output: observabilityStatusOutputSchema },
  },
  renders: {
    math: { input: adminRenderMathInput, output: adminRenderMathOutputDto },
    reindexSearch: { input: adminRenderBatchInput, output: adminRenderReindexOutputDto },
    reprojectBodies: { input: adminRenderBatchInput, output: adminRenderReprojectOutputDto },
  },
  comments: {
    approve: { input: adminCommentIdInput, output: voidOutput },
    delete: { input: adminCommentIdInput, output: voidOutput },
    edit: { input: adminCommentEditInput, output: ownCommentMutationDto },
    loadAll: { input: adminCommentsLoadAllInput, output: adminCommentsLoadAllOutputDto },
    searchPages: { input: adminCommentFilterAutocompleteInput, output: adminCommentSearchPagesOutputDto },
    searchAuthors: { input: adminCommentFilterAutocompleteInput, output: adminCommentSearchAuthorsOutputDto },
    approveCommentDeletion: { input: adminCommentApproveDeletionInput, output: adminCommentApproveDeletionOutputDto },
    listPendingDashboard: { input: adminCommentsPendingDashboardInput, output: adminPendingDashboardDto },
    pendingCount: { input: undefined, output: adminCommentsPendingCountOutputSchema },
    probeAvatarMirrors: { input: undefined, output: adminAvatarMirrorProbeOutputDto },
  },
  backup: {
    status: { input: undefined, output: adminBackupStatusOutputDto },
    list: { input: adminBackupListInput, output: adminBackupListOutputDto },
    create: { input: adminBackupCreateInput, output: adminBackupCreateOutputDto },
    restore: { input: adminBackupRestoreInput, output: adminBackupRestoreOutputDto },
    delete: { input: adminBackupDeleteInput, output: successDto },
  },
  fonts: {
    list: { input: adminFontsListInput, output: listFontsOutputDto },
    delete: { input: adminFontDeleteInput, output: adminFontDeleteOutputDto },
    setSlot: { input: setFontSlotInputDto, output: adminFontSetSlotOutputDto },
  },
  geoip: {
    status: { input: adminGeoipStatusInput, output: adminGeoipStatusOutputDto },
    update: { input: adminGeoipUpdateInput, output: adminGeoipUpdateOutputDto },
  },
  webmentions: {
    loadAll: { input: adminWebmentionListSchema, output: adminWebmentionsLoadAllOutputDto },
    approve: { input: adminWebmentionIdInput, output: voidOutput },
    reject: { input: adminWebmentionIdInput, output: voidOutput },
    reverify: { input: adminWebmentionIdInput, output: adminWebmentionDto },
    outbox: { input: adminWebmentionOutboxListSchema, output: adminWebmentionOutboxOutputDto },
    pendingCount: { input: undefined, output: adminWebmentionsPendingCountOutputSchema },
  },
  update: {
    check: { input: adminUpdateCheckInput, output: updateCheckResultDto },
    apply: { input: adminUpdateApplyInput, output: adminUpdateApplyOutputDto },
    status: { input: adminUpdateStatusInput, output: updateJobStatusDto },
  },
} as const

const ADMIN_CONTRACTS = {
  posts: adminPostsContract,
  pages: adminPagesContract,
  users: adminUsersContract,
  auditLog: adminAuditLogContract,
  settings: adminSettingsContract,
  storage: adminStorageContract,
  cache: adminCacheContract,
  mail: adminMailContract,
  friends: adminFriendsContract,
  categories: adminCategoriesContract,
  tags: adminTagsContract,
  images: adminImagesContract,
  jobs: adminJobsContract,
  music: adminMusicContract,
  notifications: adminNotificationsContract,
  observability: adminObservabilityContract,
  renders: adminRendersContract,
  comments: adminCommentsContract,
  backup: adminBackupContract,
  fonts: adminFontsContract,
  geoip: adminGeoipContract,
  webmentions: adminWebmentionsContract,
  update: adminUpdateContract,
} as const

function procedures(router: Record<string, unknown>): Record<string, AnyContractProcedure> {
  return router as Record<string, AnyContractProcedure>
}

describe('admin contracts shape', () => {
  it.each(Object.entries(ADMIN_CONTRACTS))('%s exposes exactly its deployed procedures', (domain, contract) => {
    expect(Object.keys(contract)).toEqual(Object.keys(ADMIN_ROUTES[domain as keyof typeof ADMIN_ROUTES]))
    for (const procedure of Object.values(contract)) {
      expect(isContractProcedure(procedure)).toBe(true)
    }
  })

  it.each(
    Object.entries(ADMIN_ROUTES).flatMap(([domain, routes]) =>
      Object.entries(routes).map(([key, route]) => [`${domain}.${key}`, domain, key, route] as const),
    ),
  )('%s pins the deployed method and path', (_label, domain, key, route) => {
    const contract = ADMIN_CONTRACTS[domain as keyof typeof ADMIN_CONTRACTS] as Record<string, AnyContractProcedure>
    expect(contract[key]['~orpc'].route).toEqual(route)
  })

  it.each(
    Object.entries(ADMIN_SCHEMAS).flatMap(([domain, schemas]) =>
      Object.entries(schemas).map(([key, pinned]) => [`${domain}.${key}`, domain, key, pinned] as const),
    ),
  )('%s composes the @kobato/contracts schemas by reference', (_label, domain, key, pinned) => {
    const contract = ADMIN_CONTRACTS[domain as keyof typeof ADMIN_CONTRACTS] as Record<string, AnyContractProcedure>
    const proc = contract[key]['~orpc']
    expect(proc.inputSchema).toBe(pinned.input)
    expect(proc.outputSchema).toBe(pinned.output)
  })
})

describe('revisionContract factory', () => {
  it('mounts the shared save pair under the posts and pages base paths', () => {
    const posts = revisionContract('/admin/posts')
    const pages = revisionContract('/admin/pages')
    expect(posts.saveDraft['~orpc'].route).toEqual({ method: 'POST', path: '/admin/posts/save-draft' })
    expect(posts.publishLatest['~orpc'].route).toEqual({ method: 'POST', path: '/admin/posts/publish-latest' })
    expect(pages.saveDraft['~orpc'].route).toEqual({ method: 'POST', path: '/admin/pages/save-draft' })
    expect(pages.publishLatest['~orpc'].route).toEqual({ method: 'POST', path: '/admin/pages/publish-latest' })
    for (const proc of [posts.saveDraft, posts.publishLatest, pages.saveDraft, pages.publishLatest]) {
      expect(proc['~orpc'].inputSchema).toBe(saveBodyInput)
      expect(proc['~orpc'].outputSchema).toBe(saveResultOutput)
    }
  })

  it('feeds the very same procedure objects into the domain contracts', () => {
    expect(adminPostsContract.saveDraft['~orpc'].inputSchema).toBe(saveBodyInput)
    expect(adminPagesContract.saveDraft['~orpc'].outputSchema).toBe(saveResultOutput)
  })
})

describe('adminUsersContract composition', () => {
  it('is the flat crud + admin + sessions merge of the three controller groups', () => {
    expect(Object.keys(adminUsersContract)).toEqual([
      ...Object.keys(adminUsersCrudContract),
      ...Object.keys(adminUsersAdminContract),
      ...Object.keys(adminUsersSessionsContract),
    ])
  })

  it('composes the very same procedure objects as the sub-contracts', () => {
    const merged = procedures(adminUsersContract as Record<string, unknown>)
    for (const [key, proc] of Object.entries(adminUsersCrudContract)) {
      expect(merged[key]).toBe(proc)
    }
    for (const [key, proc] of Object.entries(adminUsersAdminContract)) {
      expect(merged[key]).toBe(proc)
    }
    for (const [key, proc] of Object.entries(adminUsersSessionsContract)) {
      expect(merged[key]).toBe(proc)
    }
  })
})
