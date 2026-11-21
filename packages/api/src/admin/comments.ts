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
} from '@kobato/contracts/comments'
import { voidOutput } from '@kobato/contracts/primitives'
import { oc } from '@orpc/contract'

export const adminCommentsContract = {
  approve: oc.route({ method: 'POST', path: '/admin/comments/approve' }).input(adminCommentIdInput).output(voidOutput),
  delete: oc.route({ method: 'POST', path: '/admin/comments/delete' }).input(adminCommentIdInput).output(voidOutput),
  edit: oc
    .route({ method: 'POST', path: '/admin/comments/edit' })
    .input(adminCommentEditInput)
    .output(ownCommentMutationDto),
  loadAll: oc
    .route({ method: 'GET', path: '/admin/comments/load-all' })
    .input(adminCommentsLoadAllInput)
    .output(adminCommentsLoadAllOutputDto),
  searchPages: oc
    .route({ method: 'GET', path: '/admin/comments/search-pages' })
    .input(adminCommentFilterAutocompleteInput)
    .output(adminCommentSearchPagesOutputDto),
  searchAuthors: oc
    .route({ method: 'GET', path: '/admin/comments/search-authors' })
    .input(adminCommentFilterAutocompleteInput)
    .output(adminCommentSearchAuthorsOutputDto),
  approveCommentDeletion: oc
    .route({ method: 'POST', path: '/admin/comments/approve-comment-deletion' })
    .input(adminCommentApproveDeletionInput)
    .output(adminCommentApproveDeletionOutputDto),
  listPendingDashboard: oc
    .route({ method: 'GET', path: '/admin/comments/list-pending-dashboard' })
    .input(adminCommentsPendingDashboardInput)
    .output(adminPendingDashboardDto),
  pendingCount: oc
    .route({ method: 'GET', path: '/admin/comments/pending-count' })
    .output(adminCommentsPendingCountOutputSchema),
  probeAvatarMirrors: oc
    .route({ method: 'GET', path: '/admin/comments/probe-avatar-mirrors' })
    .output(adminAvatarMirrorProbeOutputDto),
}
