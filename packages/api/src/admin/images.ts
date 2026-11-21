import {
  adminImageIdInput,
  adminImageMutationOutputDto,
  adminImageNoteInput,
  adminImageUploadInput,
  adminImagesListInput,
  listImagesOutputDto,
} from '@kobato/contracts/images'
import { voidOutput } from '@kobato/contracts/primitives'
import { oc } from '@orpc/contract'

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
