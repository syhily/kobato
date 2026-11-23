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
import { voidOutput } from '@kobato/api/contracts/primitives'
import { ownCommentMutationDto } from '@kobato/api/contracts/public/comments'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminCommentsContract = {
  approve: defineProcedure({ method: 'POST', path: '/admin/comments/approve' })
    .input(adminCommentIdInput)
    .output(voidOutput),
  delete: defineProcedure({ method: 'POST', path: '/admin/comments/delete' })
    .input(adminCommentIdInput)
    .output(voidOutput),
  edit: defineProcedure({ method: 'POST', path: '/admin/comments/edit' })
    .input(adminCommentEditInput)
    .output(ownCommentMutationDto),
  loadAll: defineProcedure({ method: 'GET', path: '/admin/comments/load-all' })
    .input(adminCommentsLoadAllInput)
    .output(adminCommentsLoadAllOutputDto),
  searchPages: defineProcedure({ method: 'GET', path: '/admin/comments/search-pages' })
    .input(adminCommentFilterAutocompleteInput)
    .output(adminCommentSearchPagesOutputDto),
  searchAuthors: defineProcedure({ method: 'GET', path: '/admin/comments/search-authors' })
    .input(adminCommentFilterAutocompleteInput)
    .output(adminCommentSearchAuthorsOutputDto),
  approveCommentDeletion: defineProcedure({ method: 'POST', path: '/admin/comments/approve-comment-deletion' })
    .input(adminCommentApproveDeletionInput)
    .output(adminCommentApproveDeletionOutputDto),
  listPendingDashboard: defineProcedure({ method: 'GET', path: '/admin/comments/list-pending-dashboard' })
    .input(adminCommentsPendingDashboardInput)
    .output(adminPendingDashboardDto),
  pendingCount: defineProcedure({ method: 'GET', path: '/admin/comments/pending-count' }).output(
    adminCommentsPendingCountOutputSchema,
  ),
  probeAvatarMirrors: defineProcedure({ method: 'GET', path: '/admin/comments/probe-avatar-mirrors' }).output(
    adminAvatarMirrorProbeOutputDto,
  ),
}
