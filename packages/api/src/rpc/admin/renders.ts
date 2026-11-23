import {
  adminRenderBatchInput,
  adminRenderMathInput,
  adminRenderMathOutputDto,
  adminRenderReindexOutputDto,
  adminRenderReprojectOutputDto,
} from '@kobato/api/contracts/admin/renders'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminRendersContract = {
  math: defineProcedure({ method: 'POST', path: '/admin/renders/math' })
    .input(adminRenderMathInput)
    .output(adminRenderMathOutputDto),
  reindexSearch: defineProcedure({ method: 'POST', path: '/admin/renders/reindex-search' })
    .input(adminRenderBatchInput)
    .output(adminRenderReindexOutputDto),
  reprojectBodies: defineProcedure({ method: 'POST', path: '/admin/renders/reproject-bodies' })
    .input(adminRenderBatchInput)
    .output(adminRenderReprojectOutputDto),
}
