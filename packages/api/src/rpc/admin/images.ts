import {
  adminImageIdInput,
  adminImageMutationOutputDto,
  adminImageNoteInput,
  adminImageUploadInput,
  adminImagesListInput,
  listImagesOutputDto,
} from '@kobato/api/contracts/admin/images'
import { voidOutput } from '@kobato/api/contracts/primitives'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminImagesContract = {
  list: defineProcedure({ method: 'GET', path: '/admin/images/list' })
    .input(adminImagesListInput)
    .output(listImagesOutputDto),
  delete: defineProcedure({ method: 'POST', path: '/admin/images/remove' }).input(adminImageIdInput).output(voidOutput),
  updateNote: defineProcedure({ method: 'POST', path: '/admin/images/update-note' })
    .input(adminImageNoteInput)
    .output(adminImageMutationOutputDto),
  recalculateThumbhash: defineProcedure({ method: 'POST', path: '/admin/images/recalculate-thumbhash' })
    .input(adminImageIdInput)
    .output(adminImageMutationOutputDto),
  upload: defineProcedure({ method: 'POST', path: '/admin/images/upload' })
    .input(adminImageUploadInput)
    .output(adminImageMutationOutputDto),
}
