import {
  adminRenderBatchInput,
  adminRenderMathInput,
  adminRenderMathOutputDto,
  adminRenderReindexOutputDto,
  adminRenderReprojectOutputDto,
} from '@kobato/contracts/renders'
import { oc } from '@orpc/contract'

export const adminRendersContract = {
  math: oc
    .route({ method: 'POST', path: '/admin/renders/math' })
    .input(adminRenderMathInput)
    .output(adminRenderMathOutputDto),
  reindexSearch: oc
    .route({ method: 'POST', path: '/admin/renders/reindex-search' })
    .input(adminRenderBatchInput)
    .output(adminRenderReindexOutputDto),
  reprojectBodies: oc
    .route({ method: 'POST', path: '/admin/renders/reproject-bodies' })
    .input(adminRenderBatchInput)
    .output(adminRenderReprojectOutputDto),
}
