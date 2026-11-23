import type { z } from 'zod'

import {
  adminAnalyticsMentionsOutputSchema,
  adminAnalyticsOverviewOutputSchema,
  adminAnalyticsSearchInputSchema,
  adminPostAnalyticsInputSchema,
  adminPostAnalyticsOutputSchema,
  analyticsExportOutputSchema,
  analyticsHeatmapOutputSchema,
  analyticsMetricsInputSchema,
  analyticsMetricsOutputSchema,
  analyticsQuerySchema,
  countersDto,
  viewsDto,
} from '@kobato/api/contracts/admin/analytics'
import {
  auditLogActorsOutput,
  auditLogExportInput,
  auditLogExportOutput,
  auditLogListInput,
  auditLogListOutput,
} from '@kobato/api/contracts/admin/audit'
import {
  adminBackupCreateInput,
  adminBackupCreateOutputDto,
  adminBackupDeleteInput,
  adminBackupListInput,
  adminBackupListOutputDto,
  adminBackupRestoreInput,
  adminBackupRestoreOutputDto,
  adminBackupStatusOutputDto,
  adminBackupUploadRestoreDecryptInput,
  adminBackupUploadRestoreDecryptOutputDto,
  restoreJobStatusDto,
  restoreProgressDto,
} from '@kobato/api/contracts/admin/backup'
import { adminBrandingClearInput, adminBrandingClearOutputDto } from '@kobato/api/contracts/admin/branding'
import {
  adminCacheClearInput,
  adminCacheGetStatsInput,
  adminCacheStatsDto,
  clearCacheResultDto,
} from '@kobato/api/contracts/admin/cache'
import {
  adminCategoriesListInput,
  adminCategoriesListOutputDto,
  adminCategoriesReorderInput,
  adminCategoriesReorderOutputDto,
  adminCategoryIdInput,
  adminCategoryUpsertInput,
  adminCategoryUpsertOutputDto,
} from '@kobato/api/contracts/admin/categories'
import {
  adminCommentsPendingCountOutputSchema,
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
} from '@kobato/api/contracts/admin/comments'
import { contentRestoreResultDto } from '@kobato/api/contracts/admin/content-admin-base'
import {
  adminFontDeleteInput,
  adminFontDeleteOutputDto,
  adminFontsListInput,
  adminFontSetSlotOutputDto,
  listFontsOutputDto,
  setFontSlotInputDto,
} from '@kobato/api/contracts/admin/fonts'
import {
  adminFriendUpsertOutputDto,
  adminFriendsListOutputDto,
  friendIdSchema,
  listFriendsSchema,
  upsertFriendSchema,
} from '@kobato/api/contracts/admin/friends'
import {
  adminGeoipStatusInput,
  adminGeoipStatusOutputDto,
  adminGeoipUpdateInput,
  adminGeoipUpdateOutputDto,
} from '@kobato/api/contracts/admin/geoip'
import {
  adminImageIdInput,
  adminImageMutationOutputDto,
  adminImageNoteInput,
  adminImageUploadInput,
  adminImagesListInput,
  listImagesOutputDto,
} from '@kobato/api/contracts/admin/images'
import { jobHistoryInput, jobHistoryOutput, jobsListDto } from '@kobato/api/contracts/admin/jobs'
import { adminMailSendTestInput, adminMailSendTestOutputDto } from '@kobato/api/contracts/admin/mail'
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
} from '@kobato/api/contracts/admin/music'
import {
  adminRecallNotificationInput,
  adminRecallNotificationOutput,
  adminSendBroadcastInput,
  adminSendDirectInput,
  adminSendOutput,
} from '@kobato/api/contracts/admin/notifications'
import {
  observabilityProvisionInputSchema,
  observabilityProvisionOutputSchema,
  observabilityStatusInputSchema,
  observabilityStatusOutputSchema,
  observabilityTestConnectionInputSchema,
  observabilityTestConnectionOutputSchema,
} from '@kobato/api/contracts/admin/observability'
import {
  adminPageDetailDto,
  adminPageIdInput,
  adminPageUnpublishOutputDto,
  adminPageUpsertMetaOutputDto,
  listPageRevisionsOutputDto,
  listPagesOutputDto,
  listPagesSchema,
  upsertPageMetaSchema,
} from '@kobato/api/contracts/admin/pages'
import {
  adminPostsMySummaryOutputSchema,
  adminPostDetailDto,
  adminPostIdInput,
  adminPostUnpublishOutputDto,
  adminPostUpsertMetaOutputDto,
  listPostRevisionsOutputDto,
  listPostsOutputDto,
  listPostsSchema,
  upsertPostMetaSchema,
} from '@kobato/api/contracts/admin/posts'
import {
  adminRenderBatchInput,
  adminRenderMathInput,
  adminRenderMathOutputDto,
  adminRenderReindexOutputDto,
  adminRenderReprojectOutputDto,
} from '@kobato/api/contracts/admin/renders'
import { saveBodyInput, saveResultOutput } from '@kobato/api/contracts/admin/revision'
import {
  adminSettingsBootstrapOutputSchema,
  adminSettingsUpdateInput,
  adminSettingsUpdateOutput,
} from '@kobato/api/contracts/admin/settings'
import {
  adminStorageStartMigrationInput,
  adminStorageStatsOutputDto,
  storageMigrationStatusDto,
} from '@kobato/api/contracts/admin/storage'
import {
  adminTagsListInput,
  adminTagsListOutputDto,
  adminTagIdInput,
  adminTagUpsertInput,
  adminTagUpsertOutputDto,
} from '@kobato/api/contracts/admin/tags'
import {
  adminUpdateApplyInput,
  adminUpdateApplyOutputDto,
  adminUpdateCheckInput,
  adminUpdateStatusInput,
  updateCheckResultDto,
  updateJobStatusDto,
} from '@kobato/api/contracts/admin/update'
import {
  adminUserUpdateInput,
  adminUsersCountOutputSchema,
  adminUsersListSessionsOutputSchema,
  adminUsersPasskeyFlagOutputSchema,
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
} from '@kobato/api/contracts/admin/users'
import {
  adminWebmentionsPendingCountOutputSchema,
  adminWebmentionDto,
  adminWebmentionIdInput,
  adminWebmentionListSchema,
  adminWebmentionOutboxListSchema,
  adminWebmentionOutboxOutputDto,
  adminWebmentionsLoadAllOutputDto,
} from '@kobato/api/contracts/admin/webmentions'
import { successDto, voidOutput } from '@kobato/api/contracts/primitives'
import { ownCommentMutationDto } from '@kobato/api/contracts/public/comments'
import { analyticsContract } from '@kobato/api/rpc/admin/analytics'
import { adminAuditContract } from '@kobato/api/rpc/admin/audit'
import { adminBackupContract } from '@kobato/api/rpc/admin/backup'
import { adminBrandingContract } from '@kobato/api/rpc/admin/branding'
import { adminCacheContract } from '@kobato/api/rpc/admin/cache'
import { adminCategoriesContract } from '@kobato/api/rpc/admin/categories'
import { adminCommentsContract } from '@kobato/api/rpc/admin/comments'
import { adminFontsContract } from '@kobato/api/rpc/admin/fonts'
import { adminFriendsContract } from '@kobato/api/rpc/admin/friends'
import { adminGeoipContract } from '@kobato/api/rpc/admin/geoip'
import { adminImagesContract } from '@kobato/api/rpc/admin/images'
import { adminJobsContract } from '@kobato/api/rpc/admin/jobs'
import { adminMailContract } from '@kobato/api/rpc/admin/mail'
import { adminMusicContract } from '@kobato/api/rpc/admin/music'
import { adminNotificationsContract } from '@kobato/api/rpc/admin/notifications'
import { adminObservabilityContract } from '@kobato/api/rpc/admin/observability'
import { adminPagesContract } from '@kobato/api/rpc/admin/pages'
import { adminPostsContract } from '@kobato/api/rpc/admin/posts'
import { adminRendersContract } from '@kobato/api/rpc/admin/renders'
import { type RevisionContract, revisionContract } from '@kobato/api/rpc/admin/revision'
import { adminSettingsContract } from '@kobato/api/rpc/admin/settings'
import { adminStorageContract } from '@kobato/api/rpc/admin/storage'
import { adminTagsContract } from '@kobato/api/rpc/admin/tags'
import { adminUpdateContract } from '@kobato/api/rpc/admin/update'
import {
  adminUsersAdminContract,
  adminUsersContract,
  adminUsersCrudContract,
  adminUsersSessionsContract,
} from '@kobato/api/rpc/admin/users'
import { adminWebmentionsContract } from '@kobato/api/rpc/admin/webmentions'
import {
  type AnyContractProcedure,
  type InferContractRouterInputs,
  type InferContractRouterOutputs,
  isContractProcedure,
} from '@orpc/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'

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
  comments: {
    approve: { method: 'POST', path: '/admin/comments/approve' },
    delete: { method: 'POST', path: '/admin/comments/delete' },
    edit: { method: 'POST', path: '/admin/comments/edit' },
    loadAll: { method: 'GET', path: '/admin/comments/load-all' },
    searchPages: { method: 'GET', path: '/admin/comments/search-pages' },
    searchAuthors: { method: 'GET', path: '/admin/comments/search-authors' },
    approveCommentDeletion: { method: 'POST', path: '/admin/comments/approve-comment-deletion' },
    listPendingDashboard: { method: 'GET', path: '/admin/comments/list-pending-dashboard' },
    pendingCount: { method: 'GET', path: '/admin/comments/pending-count' },
    probeAvatarMirrors: { method: 'GET', path: '/admin/comments/probe-avatar-mirrors' },
  },
  backup: {
    status: { method: 'GET', path: '/admin/backup/status' },
    list: { method: 'GET', path: '/admin/backup/list' },
    create: { method: 'POST', path: '/admin/backup/create' },
    restore: { method: 'POST', path: '/admin/backup/restore' },
    delete: { method: 'POST', path: '/admin/backup/delete' },
    restoreStatus: { method: 'GET', path: '/admin/backup/restore-status' },
    restoreProgress: { method: 'GET', path: '/admin/backup/restore-progress' },
    uploadRestoreDecrypt: { method: 'POST', path: '/admin/backup/upload-restore/decrypt' },
  },
  branding: {
    clear: { method: 'POST', path: '/admin/branding/clear' },
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
  webmentions: {
    loadAll: { method: 'GET', path: '/admin/webmentions/load-all' },
    approve: { method: 'POST', path: '/admin/webmentions/approve' },
    reject: { method: 'POST', path: '/admin/webmentions/reject' },
    reverify: { method: 'POST', path: '/admin/webmentions/reverify' },
    outbox: { method: 'GET', path: '/admin/webmentions/outbox' },
    pendingCount: { method: 'GET', path: '/admin/webmentions/pending-count' },
  },
  update: {
    check: { method: 'GET', path: '/admin/update/check' },
    apply: { method: 'POST', path: '/admin/update/apply' },
    status: { method: 'GET', path: '/admin/update/status' },
  },
  analytics: {
    counters: { method: 'GET', path: '/analytics/counters' },
    views: { method: 'GET', path: '/analytics/views' },
    heatmap: { method: 'GET', path: '/analytics/heatmap' },
    metrics: { method: 'GET', path: '/analytics/metrics' },
    export: { method: 'GET', path: '/analytics/export' },
    overview: { method: 'GET', path: '/analytics/overview' },
    mentions: { method: 'GET', path: '/analytics/mentions' },
  },
} as const

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
    restoreStatus: { input: undefined, output: restoreJobStatusDto },
    restoreProgress: { input: undefined, output: restoreProgressDto },
    uploadRestoreDecrypt: {
      input: adminBackupUploadRestoreDecryptInput,
      output: adminBackupUploadRestoreDecryptOutputDto,
    },
  },
  branding: {
    clear: { input: adminBrandingClearInput, output: adminBrandingClearOutputDto },
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
  analytics: {
    counters: { input: analyticsQuerySchema, output: countersDto },
    views: { input: analyticsQuerySchema, output: viewsDto },
    heatmap: { input: analyticsQuerySchema, output: analyticsHeatmapOutputSchema },
    metrics: { input: analyticsMetricsInputSchema, output: analyticsMetricsOutputSchema },
    export: { input: analyticsQuerySchema, output: analyticsExportOutputSchema },
    overview: { input: adminAnalyticsSearchInputSchema, output: adminAnalyticsOverviewOutputSchema },
    mentions: { input: adminAnalyticsSearchInputSchema, output: adminAnalyticsMentionsOutputSchema },
  },
} as const

const ADMIN_CONTRACTS = {
  posts: adminPostsContract,
  pages: adminPagesContract,
  users: adminUsersContract,
  auditLog: adminAuditContract,
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
  branding: adminBrandingContract,
  fonts: adminFontsContract,
  geoip: adminGeoipContract,
  webmentions: adminWebmentionsContract,
  update: adminUpdateContract,
  analytics: analyticsContract,
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
  )('%s composes the @kobato/api/contracts schemas by reference', (_label, domain, key, pinned) => {
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

  it('brands the mounted posts and pages procedures with their exact routes', () => {
    for (const [contract, base] of [
      [adminPostsContract, '/admin/posts'],
      [adminPagesContract, '/admin/pages'],
    ] as const) {
      expect(contract.saveDraft['~orpc'].route).toEqual({ method: 'POST', path: `${base}/save-draft` })
      expect(contract.publishLatest['~orpc'].route).toEqual({ method: 'POST', path: `${base}/publish-latest` })
      expect(contract.saveDraft['~orpc'].inputSchema).toBe(saveBodyInput)
      expect(contract.saveDraft['~orpc'].outputSchema).toBe(saveResultOutput)
    }
  })

  it('keeps the base path literal in the type brand instead of widening it to a template', () => {
    expectTypeOf(adminPostsContract.saveDraft['~orpc'].route.method).toEqualTypeOf<'POST'>()
    expectTypeOf(adminPostsContract.saveDraft['~orpc'].route.path).toEqualTypeOf<'/admin/posts/save-draft'>()
    expectTypeOf(adminPostsContract.publishLatest['~orpc'].route.path).toEqualTypeOf<'/admin/posts/publish-latest'>()
    expectTypeOf(adminPagesContract.saveDraft['~orpc'].route.method).toEqualTypeOf<'POST'>()
    expectTypeOf(adminPagesContract.saveDraft['~orpc'].route.path).toEqualTypeOf<'/admin/pages/save-draft'>()
    expectTypeOf(adminPagesContract.publishLatest['~orpc'].route.path).toEqualTypeOf<'/admin/pages/publish-latest'>()
    type PostsLatestPath = RevisionContract<'admin/posts'>['publishLatest']['~orpc']['route']['path']
    expectTypeOf<PostsLatestPath>().toEqualTypeOf<'/admin/posts/publish-latest'>()
    expectTypeOf<InferContractRouterInputs<typeof adminPostsContract.saveDraft>>().toEqualTypeOf<
      z.input<typeof saveBodyInput>
    >()
    expectTypeOf<InferContractRouterOutputs<typeof adminPostsContract.saveDraft>>().toEqualTypeOf<
      z.output<typeof saveResultOutput>
    >()
    expectTypeOf<InferContractRouterInputs<typeof adminPagesContract.publishLatest>>().toEqualTypeOf<
      z.input<typeof saveBodyInput>
    >()
    // @ts-expect-error — the posts draft path is not the pages draft path
    expectTypeOf(adminPostsContract.saveDraft['~orpc'].route.path).toEqualTypeOf<'/admin/pages/save-draft'>()
    // @ts-expect-error — the brand is the exact literal, not `/${string}/save-draft`
    expectTypeOf(adminPagesContract.saveDraft['~orpc'].route.path).toEqualTypeOf<`/${string}/save-draft`>()
    // @ts-expect-error — publish-latest is a different path than save-draft
    const crossProcedure: '/admin/pages/save-draft' = adminPagesContract.publishLatest['~orpc'].route.path
    // @ts-expect-error — the method stays pinned to POST
    const crossMethod: 'GET' = adminPostsContract.saveDraft['~orpc'].route.method
    void crossProcedure
    void crossMethod
  })

  it('propagates the base path literal through a generic caller', () => {
    function family<const TBase extends string>(base: `/${TBase}`) {
      return revisionContract(base)
    }
    const tags = family('/admin/tags')
    expectTypeOf(tags.saveDraft['~orpc'].route.path).toEqualTypeOf<'/admin/tags/save-draft'>()
    expect(tags.saveDraft['~orpc'].route).toEqual({ method: 'POST', path: '/admin/tags/save-draft' })
    expectTypeOf(
      revisionContract('/admin/posts').saveDraft['~orpc'].route.path,
    ).toEqualTypeOf<'/admin/posts/save-draft'>()
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
