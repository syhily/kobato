import {
  adminImageIdInput,
  adminImageMutationOutputDto,
  adminImageNoteInput,
  adminImageUploadInput,
  adminImagesListInput,
  listImagesOutputDto,
} from '@kobato/contracts/images.ts'
import { voidOutput } from '@kobato/contracts/primitives.ts'
import { oc } from '@orpc/contract'

// Admin images RPC contract — author base on the server. `upload` carries a
// `Blob` (oRPC serializes it as multipart/form-data); the site-global kinds
// (category/friend) stay admin-only at the handler level.
export const adminImagesContract = {
  list: oc.route({ method: 'GET', path: '/admin/images/list' }).input(adminImagesListInput).output(listImagesOutputDto),
  delete: oc.route({ method: 'POST', path: '/admin/images/remove' }).input(adminImageIdInput).output(voidOutput),
  updateNote: oc
    .route({ method: 'POST', path: '/admin/images/update-note' })
    .input(adminImageNoteInput)
    .output(adminImageMutationOutputDto),
  recalculateThumbhash: oc
    .route({ method: 'POST', path: '/admin/images/recalculate-thumbhash' })
    .input(adminImageIdInput)
    .output(adminImageMutationOutputDto),
  upload: oc
    .route({ method: 'POST', path: '/admin/images/upload' })
    .input(adminImageUploadInput)
    .output(adminImageMutationOutputDto),
}
