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
  ownCommentMutationDto,
} from '@kobato/contracts/comments.ts'
import { voidOutput } from '@kobato/contracts/primitives.ts'
import { oc } from '@orpc/contract'

// Admin comment moderation RPC contract — admin base on the server. The
// deployed paths are the legacy `/comment-admin/*` surface (not
// `/admin/comments/*`) and must never drift.
export const adminCommentsContract = {
  approve: oc.route({ method: 'POST', path: '/comment-admin/approve' }).input(adminCommentIdInput).output(voidOutput),
  delete: oc.route({ method: 'POST', path: '/comment-admin/delete' }).input(adminCommentIdInput).output(voidOutput),
  edit: oc
    .route({ method: 'POST', path: '/comment-admin/edit' })
    .input(adminCommentEditInput)
    .output(ownCommentMutationDto),
  loadAll: oc
    .route({ method: 'GET', path: '/comment-admin/load-all' })
    .input(adminCommentsLoadAllInput)
    .output(adminCommentsLoadAllOutputDto),
  searchPages: oc
    .route({ method: 'GET', path: '/comment-admin/search-pages' })
    .input(adminCommentFilterAutocompleteInput)
    .output(adminCommentSearchPagesOutputDto),
  searchAuthors: oc
    .route({ method: 'GET', path: '/comment-admin/search-authors' })
    .input(adminCommentFilterAutocompleteInput)
    .output(adminCommentSearchAuthorsOutputDto),
  approveCommentDeletion: oc
    .route({ method: 'POST', path: '/comment-admin/approve-comment-deletion' })
    .input(adminCommentApproveDeletionInput)
    .output(adminCommentApproveDeletionOutputDto),
  listPendingDashboard: oc
    .route({ method: 'GET', path: '/comment-admin/list-pending-dashboard' })
    .input(adminCommentsPendingDashboardInput)
    .output(adminPendingDashboardDto),
  pendingCount: oc
    .route({ method: 'GET', path: '/comment-admin/pending-count' })
    .output(adminCommentsPendingCountOutputSchema),
  probeAvatarMirrors: oc
    .route({ method: 'GET', path: '/comment-admin/probe-avatar-mirrors' })
    .output(adminAvatarMirrorProbeOutputDto),
}
