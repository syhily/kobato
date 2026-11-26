import {
  likeDecreaseInput,
  likeDecreaseOutput,
  likeIncreaseInput,
  likeIncreaseOutput,
  likeValidateInput,
  likeValidateOutput,
} from '@kobato/api/contracts/public/likes'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const likesContract = {
  increase: defineProcedure({ method: 'POST', path: '/likes/increase' })
    .input(likeIncreaseInput)
    .output(likeIncreaseOutput),
  decrease: defineProcedure({ method: 'POST', path: '/likes/decrease' })
    .input(likeDecreaseInput)
    .output(likeDecreaseOutput),
  validate: defineProcedure({ method: 'GET', path: '/likes/validate' })
    .input(likeValidateInput)
    .output(likeValidateOutput),
}
