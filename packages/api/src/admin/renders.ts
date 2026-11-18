import {
  adminRenderBatchInput,
  adminRenderMathInput,
  adminRenderMathOutputDto,
  adminRenderReindexOutputDto,
  adminRenderReprojectOutputDto,
} from '@kobato/contracts/renders.ts'
import { oc } from '@orpc/contract'

// Admin renders RPC contract — admin base on the server. `math` is the
// editor's KaTeX preview; the batch cursors drive the dashboard rebuilds.
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
